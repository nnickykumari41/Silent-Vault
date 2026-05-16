import hre from "hardhat"
import { expect } from "chai"
import { time } from "@nomicfoundation/hardhat-network-helpers"
import { Encryptable, FheTypes } from "@cofhe/sdk"

describe("SilentVault", () => {
  async function deployFixture() {
    const [owner, heir, lawyer, stranger] = await hre.ethers.getSigners()
    const ownerClient = await hre.cofhe.createClientWithBatteries(owner)
    const heirClient = await hre.cofhe.createClientWithBatteries(heir)

    const SilentVault = await hre.ethers.getContractFactory("SilentVault")
    const vault = await SilentVault.deploy()
    await vault.waitForDeployment()

    return { vault, owner, heir, lawyer, stranger, ownerClient, heirClient }
  }

  async function encryptedInputs(ownerClient: any, primaryBeneficiary: string) {
    const [releaseCode, assetCount, sealedBeneficiary] = await ownerClient
      .encryptInputs([
        Encryptable.uint64(424242n),
        Encryptable.uint32(7n),
        Encryptable.address(primaryBeneficiary),
      ])
      .execute()

    return { releaseCode, assetCount, sealedBeneficiary }
  }

  it("creates a fully on-chain encrypted vault and releases handles after unlock", async () => {
    const { vault, owner, heir, lawyer, ownerClient, heirClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v1:encrypted-payload"
    const payloadHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(payload))

    await expect(
      vault
        .connect(owner)
        .createVault(
          "Family recovery",
          [heir.address, lawyer.address],
          [7000, 3000],
          0,
          0,
          payload,
          payloadHash,
          inputs.releaseCode,
          inputs.assetCount,
          inputs.sealedBeneficiary,
        ),
    )
      .to.emit(vault, "VaultCreated")
      .withArgs(1, owner.address, payloadHash)

    const [releaseCodeHandle, assetCountHandle, beneficiaryHandle] = await vault.getEncryptedHandles(1)

    expect(await ownerClient.decryptForView(releaseCodeHandle, FheTypes.Uint64).execute()).to.equal(424242n)
    expect(await ownerClient.decryptForView(assetCountHandle, FheTypes.Uint32).execute()).to.equal(7n)

    let blocked = false
    try {
      await heirClient.decryptForView(releaseCodeHandle, FheTypes.Uint64).execute()
    } catch {
      blocked = true
    }
    expect(blocked).to.equal(true)

    await vault.connect(heir).startRecovery(1)
    await vault.connect(heir).unlockVault(1)

    expect(await heirClient.decryptForView(releaseCodeHandle, FheTypes.Uint64).execute()).to.equal(424242n)
    expect(await heirClient.decryptForView(assetCountHandle, FheTypes.Uint32).execute()).to.equal(7n)
    const decodedBeneficiary = await heirClient.decryptForView(beneficiaryHandle, FheTypes.Uint160).execute()
    expect(decodedBeneficiary.toLowerCase()).to.equal(heir.address.toLowerCase())
  })

  it("uses inactivity plus grace before beneficiary unlock", async () => {
    const { vault, owner, heir, ownerClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v1:delayed-payload"
    const payloadHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(payload))

    await vault
      .connect(owner)
      .createVault(
        "Delayed recovery",
        [heir.address],
        [10000],
        7 * 24 * 60 * 60,
        3 * 24 * 60 * 60,
        payload,
        payloadHash,
        inputs.releaseCode,
        inputs.assetCount,
        inputs.sealedBeneficiary,
      )

    await expect(vault.connect(heir).startRecovery(1)).to.be.revertedWithCustomError(vault, "RecoveryNotReady")

    await time.increase(7 * 24 * 60 * 60 + 1)
    await vault.connect(heir).startRecovery(1)

    await expect(vault.connect(heir).unlockVault(1)).to.be.revertedWithCustomError(vault, "UnlockNotReady")

    await time.increase(3 * 24 * 60 * 60)
    await vault.connect(heir).unlockVault(1)

    const summary = await vault.getVault(1)
    expect(summary.unlocked).to.equal(true)
  })

  it("lets the owner check in and cancel a pending recovery", async () => {
    const { vault, owner, heir, ownerClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v1:cancel-payload"
    const payloadHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(payload))

    await vault
      .connect(owner)
      .createVault(
        "Cancelable recovery",
        [heir.address],
        [10000],
        0,
        60,
        payload,
        payloadHash,
        inputs.releaseCode,
        inputs.assetCount,
        inputs.sealedBeneficiary,
      )

    await vault.connect(heir).startRecovery(1)
    await vault.connect(owner).cancelRecovery(1)

    const summary = await vault.getVault(1)
    expect(summary.triggerStartedAt).to.equal(0)
    expect(summary.emergencyMode).to.equal(false)

    await vault.connect(owner).triggerEmergency(1)
    expect((await vault.getVault(1)).emergencyMode).to.equal(true)
  })

  it("does not let recovery be restarted to extend the grace period", async () => {
    const { vault, owner, heir, ownerClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v1:no-reset-payload"
    const payloadHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(payload))

    await vault
      .connect(owner)
      .createVault(
        "No reset recovery",
        [heir.address],
        [10000],
        0,
        60,
        payload,
        payloadHash,
        inputs.releaseCode,
        inputs.assetCount,
        inputs.sealedBeneficiary,
      )

    await vault.connect(heir).startRecovery(1)
    await expect(vault.connect(heir).startRecovery(1)).to.be.revertedWithCustomError(vault, "RecoveryAlreadyStarted")
  })

  it("rejects strangers and invalid beneficiary configurations", async () => {
    const { vault, owner, heir, stranger, ownerClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v1:invalid-payload"
    const payloadHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(payload))

    await expect(
      vault
        .connect(owner)
        .createVault(
          "Bad split",
          [heir.address],
          [9999],
          0,
          0,
          payload,
          payloadHash,
          inputs.releaseCode,
          inputs.assetCount,
          inputs.sealedBeneficiary,
        ),
    ).to.be.revertedWithCustomError(vault, "InvalidBeneficiaries")

    await vault
      .connect(owner)
      .createVault(
        "Valid split",
        [heir.address],
        [10000],
        0,
        0,
        payload,
        payloadHash,
        inputs.releaseCode,
        inputs.assetCount,
        inputs.sealedBeneficiary,
      )

    await expect(vault.connect(stranger).startRecovery(1)).to.be.revertedWithCustomError(vault, "NotAuthorized")
    await vault.connect(heir).startRecovery(1)
    await expect(vault.connect(stranger).unlockVault(1)).to.be.revertedWithCustomError(vault, "NotAuthorized")
  })
})

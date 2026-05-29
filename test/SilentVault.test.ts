import hre from "hardhat"
import { expect } from "chai"
import { time } from "@nomicfoundation/hardhat-network-helpers"
import { Encryptable, FheTypes } from "@cofhe/sdk"

describe("SilentVault", () => {
  async function deployFixture() {
    const [owner, heir, lawyer, stranger] = await hre.ethers.getSigners()
    const ownerClient = await hre.cofhe.createClientWithBatteries(owner)
    const heirClient = await hre.cofhe.createClientWithBatteries(heir)
    const lawyerClient = await hre.cofhe.createClientWithBatteries(lawyer)

    const SilentVault = await hre.ethers.getContractFactory("SilentVault")
    const vault = await SilentVault.deploy()
    await vault.waitForDeployment()

    return { vault, owner, heir, lawyer, stranger, ownerClient, heirClient, lawyerClient }
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

  function metadata(payload: string) {
    return {
      encryptedPayload: payload,
      payloadHash: hre.ethers.keccak256(hre.ethers.toUtf8Bytes(payload)),
      externalPayloadCid: "ipfs://bafybeiguidedmanifest",
      externalPayloadHash: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("external-manifest")),
      notificationHash: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("email:telegram:wallet")),
      proofOfLifeHash: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("manual-checkin:wallet-activity")),
    }
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

  it("requires the configured recovery approval threshold before unlock", async () => {
    const { vault, owner, heir, lawyer, ownerClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v2:multi-sign-payload"
    const vaultMetadata = metadata(payload)

    await vault
      .connect(owner)
      .createVaultAdvanced(
        "Two signer recovery",
        [heir.address, lawyer.address],
        [5000, 5000],
        [],
        [],
        { inactivityPeriod: 0, gracePeriod: 0, approvalThreshold: 2 },
        vaultMetadata,
        inputs.releaseCode,
        inputs.assetCount,
        inputs.sealedBeneficiary,
      )

    await expect(vault.connect(heir).startRecovery(1))
      .to.emit(vault, "RecoveryApproved")
      .withArgs(1, heir.address, 1, 2)

    await expect(vault.connect(heir).unlockVault(1)).to.be.revertedWithCustomError(vault, "UnlockNotReady")
    await expect(vault.connect(lawyer).approveRecovery(1))
      .to.emit(vault, "RecoveryApproved")
      .withArgs(1, lawyer.address, 2, 2)
    await vault.connect(heir).unlockVault(1)

    const summary = await vault.getVault(1)
    expect(summary.approvalThreshold).to.equal(2)
    expect(summary.recoveryApprovals).to.equal(2)
    expect(summary.externalPayloadCid).to.equal(vaultMetadata.externalPayloadCid)
    expect(summary.notificationHash).to.equal(vaultMetadata.notificationHash)
  })

  it("lets the owner rotate an unreleased beneficiary wallet", async () => {
    const { vault, owner, heir, lawyer, ownerClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v2:rotation-payload"
    const payloadHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(payload))

    await vault
      .connect(owner)
      .createVault(
        "Rotatable recovery",
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

    await expect(vault.connect(owner).rotateBeneficiary(1, heir.address, lawyer.address))
      .to.emit(vault, "BeneficiaryRotated")
      .withArgs(1, owner.address, heir.address, lawyer.address)

    expect(await vault.isVaultBeneficiary(1, heir.address)).to.equal(false)
    expect(await vault.isVaultBeneficiary(1, lawyer.address)).to.equal(true)
    expect(await vault.getVaultsByBeneficiary(heir.address)).to.deep.equal([])
    expect(await vault.getVaultsByBeneficiary(lawyer.address)).to.deep.equal([1n])

    await expect(vault.connect(heir).startRecovery(1)).to.be.revertedWithCustomError(vault, "NotAuthorized")
    await vault.connect(lawyer).startRecovery(1)
    await vault.connect(lawyer).unlockVault(1)

    expect((await vault.getVault(1)).unlocked).to.equal(true)
  })

  it("hides committed beneficiaries until they reveal their claim salt", async () => {
    const { vault, owner, heir, stranger, ownerClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v2:hidden-beneficiary-payload"
    const vaultMetadata = metadata(payload)
    const salt = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("heir-private-claim-code"))
    const commitment = await vault.computeHiddenBeneficiaryCommitment(heir.address, salt)

    await vault
      .connect(owner)
      .createVaultAdvanced(
        "Hidden heir recovery",
        [],
        [],
        [commitment],
        [10000],
        { inactivityPeriod: 0, gracePeriod: 0, approvalThreshold: 1 },
        vaultMetadata,
        inputs.releaseCode,
        inputs.assetCount,
        inputs.sealedBeneficiary,
      )

    const hiddenBeforeReveal = await vault.getBeneficiaries(1)
    expect(hiddenBeforeReveal[0].wallet).to.equal(hre.ethers.ZeroAddress)
    expect(await vault.getVaultsByBeneficiary(heir.address)).to.deep.equal([])

    await expect(vault.connect(stranger).revealHiddenBeneficiary(1, salt)).to.be.revertedWithCustomError(vault, "NotAuthorized")
    await expect(vault.connect(heir).revealHiddenBeneficiary(1, salt))
      .to.emit(vault, "HiddenBeneficiaryRevealed")
      .withArgs(1, heir.address, commitment)

    const hiddenAfterReveal = await vault.getBeneficiaries(1)
    expect(hiddenAfterReveal[0].wallet).to.equal(heir.address)
    expect(await vault.getVaultsByBeneficiary(heir.address)).to.deep.equal([1n])

    await vault.connect(heir).startRecovery(1)
    await vault.connect(heir).unlockVault(1)

    expect((await vault.getVault(1)).unlocked).to.equal(true)
  })

  it("rejects a hidden reveal that would duplicate an existing public beneficiary", async () => {
    const { vault, owner, heir, ownerClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v2:duplicate-hidden-claim-payload"
    const vaultMetadata = metadata(payload)
    const salt = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("duplicate-public-beneficiary-code"))
    const commitment = await vault.computeHiddenBeneficiaryCommitment(heir.address, salt)

    await vault
      .connect(owner)
      .createVaultAdvanced(
        "Duplicate hidden claim",
        [heir.address],
        [5000],
        [commitment],
        [5000],
        { inactivityPeriod: 0, gracePeriod: 0, approvalThreshold: 2 },
        vaultMetadata,
        inputs.releaseCode,
        inputs.assetCount,
        inputs.sealedBeneficiary,
      )

    await expect(vault.connect(heir).revealHiddenBeneficiary(1, salt)).to.be.revertedWithCustomError(
      vault,
      "InvalidBeneficiaries",
    )
    expect(await vault.isVaultBeneficiary(1, heir.address)).to.equal(true)
    const beneficiaries = await vault.getBeneficiaries(1)
    expect(beneficiaries[1].wallet).to.equal(hre.ethers.ZeroAddress)
  })

  it("lets the owner rotate an unrevealed hidden beneficiary commitment", async () => {
    const { vault, owner, heir, lawyer, ownerClient } = await deployFixture()
    const inputs = await encryptedInputs(ownerClient, heir.address)
    const payload = "vault:v2:hidden-rotation-payload"
    const vaultMetadata = metadata(payload)
    const oldSalt = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("old-hidden-claim-code"))
    const newSalt = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("new-hidden-claim-code"))
    const oldCommitment = await vault.computeHiddenBeneficiaryCommitment(heir.address, oldSalt)
    const newCommitment = await vault.computeHiddenBeneficiaryCommitment(lawyer.address, newSalt)

    await vault
      .connect(owner)
      .createVaultAdvanced(
        "Rotating hidden heir",
        [],
        [],
        [oldCommitment],
        [10000],
        { inactivityPeriod: 0, gracePeriod: 0, approvalThreshold: 1 },
        vaultMetadata,
        inputs.releaseCode,
        inputs.assetCount,
        inputs.sealedBeneficiary,
      )

    await expect(vault.connect(owner).rotateHiddenBeneficiaryCommitment(1, oldCommitment, newCommitment))
      .to.emit(vault, "HiddenBeneficiaryRotated")
      .withArgs(1, owner.address, oldCommitment, newCommitment)

    await expect(vault.connect(heir).revealHiddenBeneficiary(1, oldSalt)).to.be.revertedWithCustomError(
      vault,
      "NotAuthorized",
    )
    await vault.connect(lawyer).revealHiddenBeneficiary(1, newSalt)

    const hiddenAfterReveal = await vault.getBeneficiaries(1)
    expect(hiddenAfterReveal[0].wallet).to.equal(lawyer.address)
    expect(await vault.getVaultsByBeneficiary(lawyer.address)).to.deep.equal([1n])
  })
})

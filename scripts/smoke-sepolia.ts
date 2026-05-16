import { Encryptable, FheTypes } from "@cofhe/sdk"
import { chains } from "@cofhe/sdk/chains"
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/node"
import { privateKeyToAccount } from "viem/accounts"
import { createPublicClient, createWalletClient, http, keccak256, parseAbi, toBytes } from "viem"
import { sepolia } from "viem/chains"

const abi = parseAbi([
  "function createVault(string label, address[] beneficiaryWallets, uint16[] sharesBps, uint64 inactivityPeriod, uint64 gracePeriod, string encryptedPayload, bytes32 payloadHash, (uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature) releaseCodeInput, (uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature) assetCountInput, (uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature) primaryBeneficiaryInput) returns (uint256 vaultId)",
  "function startRecovery(uint256 vaultId)",
  "function unlockVault(uint256 vaultId)",
  "function getVault(uint256 vaultId) view returns ((uint256 id,address owner,string label,uint64 createdAt,uint64 inactivityPeriod,uint64 gracePeriod,uint64 lastCheckIn,uint64 triggerStartedAt,bool emergencyMode,bool unlocked,string encryptedPayload,bytes32 payloadHash,uint256 beneficiaryCount))",
  "function getEncryptedHandles(uint256 vaultId) view returns (bytes32 releaseCode, bytes32 assetCount, bytes32 primaryBeneficiary)",
  "function vaultCount() view returns (uint256)",
])

const encoder = new TextEncoder()

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function deriveVaultKey(releaseCode: string, owner: string, primaryBeneficiary: string) {
  const secretMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${releaseCode}:${owner.toLowerCase()}:${primaryBeneficiary.toLowerCase()}:silentvault-v1`),
    "PBKDF2",
    false,
    ["deriveKey"],
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("silentvault-release-payload"),
      iterations: 210_000,
      hash: "SHA-256",
    },
    secretMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

async function encryptSmokePayload(secret: string, releaseCode: string, owner: string, primaryBeneficiary: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveVaultKey(releaseCode, owner, primaryBeneficiary)
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(secret))

  return JSON.stringify({
    version: 1,
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  })
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY?.startsWith("0x")
    ? process.env.PRIVATE_KEY
    : `0x${process.env.PRIVATE_KEY || ""}`
  const contractAddress = process.env.NEXT_PUBLIC_SILENT_VAULT_ADDRESS

  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("PRIVATE_KEY is required for Sepolia smoke test")
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress || "")) {
    throw new Error("NEXT_PUBLIC_SILENT_VAULT_ADDRESS is required for Sepolia smoke test")
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) })

  const cofheConfig = createCofheConfig({ supportedChains: [chains.sepolia] })
  const cofheClient = createCofheClient(cofheConfig)
  await cofheClient.connect(publicClient as any, walletClient as any)
  await cofheClient.permits.getOrCreateSelfPermit()

  const releaseCode = 777001n
  const [encryptedReleaseCode, encryptedAssetCount, encryptedPrimaryBeneficiary] = await cofheClient
    .encryptInputs([Encryptable.uint64(releaseCode), Encryptable.uint32(3n), Encryptable.address(account.address)])
    .execute()

  const beforeCount = await publicClient.readContract({
    address: contractAddress as `0x${string}`,
    abi,
    functionName: "vaultCount",
  })
  const secret = `Sepolia smoke recovery package ${Date.now()}`
  const payload = await encryptSmokePayload(secret, releaseCode.toString(), account.address, account.address)
  const payloadHash = keccak256(toBytes(payload))

  const createHash = await walletClient.writeContract({
    address: contractAddress as `0x${string}`,
    abi,
    functionName: "createVault",
    args: [
      "Sepolia smoke vault",
      [account.address],
      [10000],
      0n,
      0n,
      payload,
      payloadHash,
      encryptedReleaseCode as any,
      encryptedAssetCount as any,
      encryptedPrimaryBeneficiary as any,
    ],
  })
  await publicClient.waitForTransactionReceipt({ hash: createHash })

  const vaultId = beforeCount + 1n
  await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi,
      functionName: "startRecovery",
      args: [vaultId],
    }),
  })
  await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi,
      functionName: "unlockVault",
      args: [vaultId],
    }),
  })

  const vault = await publicClient.readContract({
    address: contractAddress as `0x${string}`,
    abi,
    functionName: "getVault",
    args: [vaultId],
  })
  const [releaseHandle, assetHandle, beneficiaryHandle] = await publicClient.readContract({
    address: contractAddress as `0x${string}`,
    abi,
    functionName: "getEncryptedHandles",
    args: [vaultId],
  })

  const decryptedReleaseCode = await cofheClient.decryptForView(releaseHandle, FheTypes.Uint64).execute()
  const decryptedAssetCount = await cofheClient.decryptForView(assetHandle, FheTypes.Uint32).execute()
  const decryptedBeneficiary = await cofheClient.decryptForView(beneficiaryHandle, FheTypes.Uint160).execute()

  console.log(
    JSON.stringify(
      {
        contractAddress,
        actor: account.address,
        vaultId: vaultId.toString(),
        createHash,
        unlocked: (vault as any).unlocked ?? (vault as any)[9],
        decryptedReleaseCode: decryptedReleaseCode.toString(),
        decryptedAssetCount: decryptedAssetCount.toString(),
        decryptedBeneficiary,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

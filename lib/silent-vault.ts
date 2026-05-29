import { arbitrumSepolia, baseSepolia, sepolia } from "viem/chains"
import { parseAbi, type Address, type Chain } from "viem"

export const silentVaultAbi = parseAbi([
  "event VaultCreated(uint256 indexed vaultId, address indexed owner, bytes32 payloadHash)",
  "event CheckIn(uint256 indexed vaultId, address indexed owner, uint64 timestamp)",
  "event RecoveryStarted(uint256 indexed vaultId, address indexed actor, uint64 unlocksAt, bool emergencyMode)",
  "event RecoveryApproved(uint256 indexed vaultId, address indexed actor, uint8 approvals, uint8 threshold)",
  "event RecoveryCancelled(uint256 indexed vaultId, address indexed owner)",
  "event VaultUnlocked(uint256 indexed vaultId, address indexed actor)",
  "event BeneficiaryRotated(uint256 indexed vaultId, address indexed owner, address indexed oldWallet, address newWallet)",
  "event HiddenBeneficiaryRotated(uint256 indexed vaultId, address indexed owner, bytes32 oldCommitment, bytes32 newCommitment)",
  "event HiddenBeneficiaryRevealed(uint256 indexed vaultId, address indexed beneficiary, bytes32 commitment)",
  "event VaultMetadataUpdated(uint256 indexed vaultId, bytes32 payloadHash, bytes32 externalPayloadHash, bytes32 notificationHash, bytes32 proofOfLifeHash)",
  "function createVault(string label, address[] beneficiaryWallets, uint16[] sharesBps, uint64 inactivityPeriod, uint64 gracePeriod, string encryptedPayload, bytes32 payloadHash, (uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature) releaseCodeInput, (uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature) assetCountInput, (uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature) primaryBeneficiaryInput) returns (uint256 vaultId)",
  "function createVaultAdvanced(string label, address[] beneficiaryWallets, uint16[] sharesBps, bytes32[] hiddenBeneficiaryCommitments, uint16[] hiddenSharesBps, (uint64 inactivityPeriod,uint64 gracePeriod,uint8 approvalThreshold) policy, (string encryptedPayload,bytes32 payloadHash,string externalPayloadCid,bytes32 externalPayloadHash,bytes32 notificationHash,bytes32 proofOfLifeHash) metadata, (uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature) releaseCodeInput, (uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature) assetCountInput, (uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature) primaryBeneficiaryInput) returns (uint256 vaultId)",
  "function checkIn(uint256 vaultId)",
  "function startRecovery(uint256 vaultId)",
  "function approveRecovery(uint256 vaultId)",
  "function triggerEmergency(uint256 vaultId)",
  "function cancelRecovery(uint256 vaultId)",
  "function unlockVault(uint256 vaultId)",
  "function grantUnlockedAccess(uint256 vaultId)",
  "function rotateBeneficiary(uint256 vaultId, address oldWallet, address newWallet)",
  "function rotateHiddenBeneficiaryCommitment(uint256 vaultId, bytes32 oldCommitment, bytes32 newCommitment)",
  "function revealHiddenBeneficiary(uint256 vaultId, bytes32 salt)",
  "function updateVaultMetadata(uint256 vaultId, string encryptedPayload, bytes32 payloadHash, string externalPayloadCid, bytes32 externalPayloadHash, bytes32 notificationHash, bytes32 proofOfLifeHash)",
  "function getVault(uint256 vaultId) view returns ((uint256 id,address owner,string label,uint64 createdAt,uint64 inactivityPeriod,uint64 gracePeriod,uint64 lastCheckIn,uint64 triggerStartedAt,bool emergencyMode,bool unlocked,string encryptedPayload,bytes32 payloadHash,uint256 beneficiaryCount,uint8 approvalThreshold,uint8 recoveryApprovals,bool hiddenBeneficiaries,string externalPayloadCid,bytes32 externalPayloadHash,bytes32 notificationHash,bytes32 proofOfLifeHash))",
  "function getBeneficiaries(uint256 vaultId) view returns ((address wallet,uint16 shareBps)[])",
  "function getHiddenBeneficiaryCommitments(uint256 vaultId) view returns (bytes32[])",
  "function getEncryptedHandles(uint256 vaultId) view returns (bytes32 releaseCode, bytes32 assetCount, bytes32 primaryBeneficiary)",
  "function getVaultsByOwner(address owner) view returns (uint256[])",
  "function getVaultsByBeneficiary(address beneficiary) view returns (uint256[])",
  "function isVaultBeneficiary(uint256 vaultId, address beneficiary) view returns (bool)",
  "function hasApprovedRecovery(uint256 vaultId, address actor) view returns (bool)",
  "function isRecoveryReady(uint256 vaultId) view returns (bool)",
  "function canUnlock(uint256 vaultId) view returns (bool)",
  "function computeHiddenBeneficiaryCommitment(address wallet, bytes32 salt) pure returns (bytes32)",
  "function vaultCount() view returns (uint256)",
])

export const zeroBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const

export const silentVaultLegacyAbi = parseAbi([
  "function getVault(uint256 vaultId) view returns ((uint256 id,address owner,string label,uint64 createdAt,uint64 inactivityPeriod,uint64 gracePeriod,uint64 lastCheckIn,uint64 triggerStartedAt,bool emergencyMode,bool unlocked,string encryptedPayload,bytes32 payloadHash,uint256 beneficiaryCount))",
])

export type SupportedChain = {
  id: number
  name: string
  shortName: string
  chain: Chain
  rpcUrl: string
  explorer: string
  cofheKey: "sepolia" | "arbSepolia" | "baseSepolia"
}

export const supportedChains: Record<number, SupportedChain> = {
  11155111: {
    id: 11155111,
    name: "Ethereum Sepolia",
    shortName: "Sepolia",
    chain: sepolia,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    cofheKey: "sepolia",
  },
  421614: {
    id: 421614,
    name: "Arbitrum Sepolia",
    shortName: "Arb Sepolia",
    chain: arbitrumSepolia,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
    cofheKey: "arbSepolia",
  },
  84532: {
    id: 84532,
    name: "Base Sepolia",
    shortName: "Base Sepolia",
    chain: baseSepolia,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    cofheKey: "baseSepolia",
  },
}

export const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111)
export const activeChain = supportedChains[configuredChainId] || supportedChains[11155111]
export const silentVaultAddress = process.env.NEXT_PUBLIC_SILENT_VAULT_ADDRESS as Address | undefined

export function hasContractAddress(address = silentVaultAddress): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address || "")
}

export function explorerTx(hash: string) {
  return `${activeChain.explorer}/tx/${hash}`
}

export function explorerAddress(address: string) {
  return `${activeChain.explorer}/address/${address}`
}

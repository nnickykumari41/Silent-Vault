"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  AlertTriangle,
  Ban,
  Bell,
  CalendarClock,
  CheckCircle2,
  Copy,
  Database,
  EyeOff,
  ExternalLink,
  FileArchive,
  FileCheck2,
  FileText,
  Fingerprint,
  HeartPulse,
  KeyRound,
  Loader2,
  LockKeyhole,
  Play,
  Radio,
  RefreshCw,
  Shield,
  Timer,
  Unlock,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react"
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodePacked,
  http,
  isAddress,
  keccak256,
  toBytes,
  toHex,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem"
import {
  activeChain,
  explorerAddress,
  explorerTx,
  hasContractAddress,
  silentVaultAbi,
  silentVaultLegacyAbi,
  silentVaultAddress,
  zeroBytes32,
} from "@/lib/silent-vault"
import { decryptVaultPayload, encryptVaultPayload, makeBytes32Salt, makeReleaseCode, sha256Bytes32 } from "@/lib/vault-crypto"

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on?: (event: string, handler: (...args: unknown[]) => void) => void
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
    }
  }
}

type BeneficiaryDraft = {
  wallet: string
  share: number
  hidden: boolean
  salt: string
}

type Beneficiary = {
  wallet: Address
  shareBps: number
}

type VaultRecord = {
  id: bigint
  owner: Address
  label: string
  createdAt: bigint
  inactivityPeriod: bigint
  gracePeriod: bigint
  lastCheckIn: bigint
  triggerStartedAt: bigint
  emergencyMode: boolean
  unlocked: boolean
  encryptedPayload: string
  payloadHash: string
  beneficiaryCount: bigint
  approvalThreshold: number
  recoveryApprovals: number
  hiddenBeneficiaries: boolean
  externalPayloadCid: string
  externalPayloadHash: string
  notificationHash: string
  proofOfLifeHash: string
  currentUserApproved: boolean
  beneficiaries: Beneficiary[]
  hiddenCommitments: string[]
  recoveryReady: boolean
  unlockReady: boolean
}

type VaultEventRecord = {
  id: string
  name: string
  vaultId: string
  txHash: string
  blockNumber: string
  logIndex?: string
  timestamp?: string
}

type DecryptedVault = {
  secret: string
  releaseCode: string
  assetCount: string
  primaryBeneficiary: string
}

type VaultMetadataDraft = {
  externalPayloadCid: string
  externalPayloadHash: string
  notificationHash: string
  proofOfLifeHash: string
}

type CofheRuntime = {
  client: any
  Encryptable: any
  FheTypes: any
}

type SilentVaultView = "overview" | "create" | "beneficiary" | "roadmap"
type VaultWriteAction =
  | "checkIn"
  | "startRecovery"
  | "approveRecovery"
  | "triggerEmergency"
  | "cancelRecovery"
  | "unlockVault"
  | "grantUnlockedAccess"

export function SilentVaultDashboardRouter() {
  const pathname = usePathname()
  const activeView: SilentVaultView = pathname.endsWith("/create")
    ? "create"
    : pathname.endsWith("/beneficiary")
      ? "beneficiary"
      : pathname.endsWith("/roadmap")
        ? "roadmap"
        : "overview"

  return <SilentVaultDashboard activeView={activeView} />
}

const timerPresets = [
  { label: "Demo: immediate", inactivity: 0, grace: 0 },
  { label: "Demo: five minutes", inactivity: 5 * 60, grace: 0 },
  { label: "30 days + 7 day grace", inactivity: 30 * 24 * 60 * 60, grace: 7 * 24 * 60 * 60 },
  { label: "90 days + 14 day grace", inactivity: 90 * 24 * 60 * 60, grace: 14 * 24 * 60 * 60 },
  { label: "1 year + 30 day grace", inactivity: 365 * 24 * 60 * 60, grace: 30 * 24 * 60 * 60 },
]

const initialSecret =
  "Recovery instructions:\n- Hardware wallet is in the bank locker.\n- Use the release secret to decrypt this note.\n- Contact the second beneficiary before moving funds."

const zeroAddress = "0x0000000000000000000000000000000000000000"

const recoveryTemplates = [
  {
    label: "Wallet inventory",
    body: "\n\nWallet inventory:\n- Hardware wallets:\n- Hot wallets:\n- Multisigs:\n- Important chains:\n- Assets to check first:",
  },
  {
    label: "Exchange accounts",
    body: "\n\nExchange accounts:\n- Exchange name:\n- Account email:\n- Recovery contact:\n- 2FA location:\n- Withdrawal notes:",
  },
  {
    label: "Legal contacts",
    body: "\n\nLegal and trustee contacts:\n- Attorney:\n- Executor:\n- Family contact:\n- Documents location:\n- Instructions before moving funds:",
  },
  {
    label: "Final instructions",
    body: "\n\nFinal instructions:\n- First call:\n- Do not share:\n- Tax/legal reminder:\n- Emergency exceptions:\n- Personal note:",
  },
]

function getTupleValue<T>(tuple: any, key: string, index: number): T {
  return (tuple?.[key] ?? tuple?.[index]) as T
}

function secondsToText(value: bigint | number) {
  const seconds = Number(value)
  if (seconds === 0) return "Immediate"
  const day = 24 * 60 * 60
  if (seconds >= day) return `${Math.round(seconds / day)} days`
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`
  return `${seconds}s`
}

function dateText(epoch: bigint | number) {
  const value = Number(epoch)
  if (!value) return "Not started"
  return new Date(value * 1000).toLocaleString()
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isZeroAddress(address: string) {
  return address.toLowerCase() === zeroAddress
}

function isBytes32(value: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(value)
}

function hashJson(value: unknown) {
  return keccak256(toBytes(JSON.stringify(value)))
}

function statusFor(vault: VaultRecord) {
  if (vault.unlocked) return { label: "Unlocked", className: "bg-emerald-50 text-emerald-700", icon: Unlock }
  if (vault.emergencyMode) return { label: "Emergency", className: "bg-rose-50 text-rose-700", icon: AlertTriangle }
  if (vault.triggerStartedAt > 0n) return { label: "Grace period", className: "bg-amber-50 text-amber-700", icon: Timer }
  return { label: "Locked", className: "bg-zinc-100 text-zinc-700", icon: LockKeyhole }
}

function toBps(share: number) {
  return Math.round(share * 100)
}

function normalizeVault(
  view: any,
  beneficiaries: any[],
  hiddenCommitments: string[],
  recoveryReady: boolean,
  unlockReady: boolean,
  currentUserApproved: boolean,
): VaultRecord {
  const approvalThreshold = getTupleValue<bigint | number | undefined>(view, "approvalThreshold", 13)
  const recoveryApprovals = getTupleValue<bigint | number | undefined>(view, "recoveryApprovals", 14)
  const hiddenBeneficiaries = getTupleValue<boolean | undefined>(view, "hiddenBeneficiaries", 15)
  const externalPayloadCid = getTupleValue<string | undefined>(view, "externalPayloadCid", 16)
  const externalPayloadHash = getTupleValue<string | undefined>(view, "externalPayloadHash", 17)
  const notificationHash = getTupleValue<string | undefined>(view, "notificationHash", 18)
  const proofOfLifeHash = getTupleValue<string | undefined>(view, "proofOfLifeHash", 19)

  return {
    id: getTupleValue<bigint>(view, "id", 0),
    owner: getTupleValue<Address>(view, "owner", 1),
    label: getTupleValue<string>(view, "label", 2),
    createdAt: getTupleValue<bigint>(view, "createdAt", 3),
    inactivityPeriod: getTupleValue<bigint>(view, "inactivityPeriod", 4),
    gracePeriod: getTupleValue<bigint>(view, "gracePeriod", 5),
    lastCheckIn: getTupleValue<bigint>(view, "lastCheckIn", 6),
    triggerStartedAt: getTupleValue<bigint>(view, "triggerStartedAt", 7),
    emergencyMode: getTupleValue<boolean>(view, "emergencyMode", 8),
    unlocked: getTupleValue<boolean>(view, "unlocked", 9),
    encryptedPayload: getTupleValue<string>(view, "encryptedPayload", 10),
    payloadHash: getTupleValue<string>(view, "payloadHash", 11),
    beneficiaryCount: getTupleValue<bigint>(view, "beneficiaryCount", 12),
    approvalThreshold: Number(approvalThreshold ?? 1),
    recoveryApprovals: Number(recoveryApprovals ?? 0),
    hiddenBeneficiaries: Boolean(hiddenBeneficiaries),
    externalPayloadCid: externalPayloadCid ?? "",
    externalPayloadHash: externalPayloadHash ?? zeroBytes32,
    notificationHash: notificationHash ?? zeroBytes32,
    proofOfLifeHash: proofOfLifeHash ?? zeroBytes32,
    currentUserApproved,
    beneficiaries: beneficiaries.map((beneficiary: any) => ({
      wallet: getTupleValue<Address>(beneficiary, "wallet", 0),
      shareBps: Number(getTupleValue<bigint | number>(beneficiary, "shareBps", 1)),
    })),
    hiddenCommitments,
    recoveryReady,
    unlockReady,
  }
}

export function SilentVaultDashboard({ activeView = "overview" }: { activeView?: SilentVaultView }) {
  const router = useRouter()
  const [account, setAccount] = useState<Address>()
  const [publicClient, setPublicClient] = useState<PublicClient>()
  const [walletClient, setWalletClient] = useState<WalletClient>()
  const [cofhe, setCofhe] = useState<CofheRuntime>()
  const [vaults, setVaults] = useState<VaultRecord[]>([])
  const [events, setEvents] = useState<VaultEventRecord[]>([])
  const [decrypted, setDecrypted] = useState<Record<string, DecryptedVault>>({})
  const [wave5Ready, setWave5Ready] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [status, setStatus] = useState("Connect a wallet to create or manage a private recovery vault.")
  const [lastTx, setLastTx] = useState<string>()
  const [label, setLabel] = useState("Family recovery vault")
  const [assetCount, setAssetCount] = useState(7)
  const [timerIndex, setTimerIndex] = useState(0)
  const [approvalThreshold, setApprovalThreshold] = useState(1)
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>(() => [
    { wallet: "", share: 100, hidden: false, salt: makeBytes32Salt() },
  ])
  const [secret, setSecret] = useState(initialSecret)
  const [externalPayloadCid, setExternalPayloadCid] = useState("")
  const [externalPayloadHash, setExternalPayloadHash] = useState("")
  const [notificationEmail, setNotificationEmail] = useState("")
  const [notificationTelegram, setNotificationTelegram] = useState("")
  const [notificationWebhook, setNotificationWebhook] = useState("")
  const [proofOfLifePlan, setProofOfLifePlan] = useState("Manual check-in plus wallet activity review.")
  const [hiddenClaimSummary, setHiddenClaimSummary] = useState<string[]>([])
  const [claimVaultId, setClaimVaultId] = useState("")
  const [claimSalt, setClaimSalt] = useState("")

  const contractReady = hasContractAddress()
  const ownedVaults = useMemo(
    () => vaults.filter((vault) => account && vault.owner.toLowerCase() === account.toLowerCase()),
    [account, vaults],
  )
  const beneficiaryVaults = useMemo(
    () =>
      vaults.filter(
        (vault) =>
          account &&
          vault.owner.toLowerCase() !== account.toLowerCase() &&
          vault.beneficiaries.some((beneficiary) => beneficiary.wallet.toLowerCase() === account.toLowerCase()),
      ),
    [account, vaults],
  )

  const validBeneficiaries = beneficiaries.filter((beneficiary) => isAddress(beneficiary.wallet))
  const shareTotalBps = beneficiaries.reduce((sum, beneficiary) => sum + toBps(Number(beneficiary.share || 0)), 0)
  const shareTotal = shareTotalBps / 100
  const publicBeneficiaries = validBeneficiaries.filter((beneficiary) => !beneficiary.hidden)
  const hiddenBeneficiaries = validBeneficiaries.filter((beneficiary) => beneficiary.hidden)
  const beneficiaryWallets = validBeneficiaries.map((beneficiary) => beneficiary.wallet.toLowerCase())
  const hasDuplicateBeneficiaryWallets = new Set(beneficiaryWallets).size !== beneficiaryWallets.length
  const beneficiarySharesValid = beneficiaries.every((beneficiary) => {
    const shareBps = toBps(Number(beneficiary.share))
    return Number.isFinite(beneficiary.share) && shareBps > 0 && shareBps <= 10000
  })

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setStatus("No injected wallet found. Install or enable the browser wallet extension, then refresh.")
      return
    }

    setIsBusy(true)
    try {
      setStatus(`Requesting wallet access on ${activeChain.name}...`)
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as Address[]
      const selected = accounts[0]
      if (!selected) throw new Error("No wallet account returned")

      const chainId = (await window.ethereum.request({ method: "eth_chainId" })) as string
      if (Number(chainId) !== activeChain.id) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: toHex(activeChain.id) }],
          })
        } catch (error: any) {
          if (error?.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: toHex(activeChain.id),
                  chainName: activeChain.name,
                  nativeCurrency: activeChain.chain.nativeCurrency,
                  rpcUrls: [activeChain.rpcUrl],
                  blockExplorerUrls: [activeChain.explorer],
                },
              ],
            })
          } else {
            throw error
          }
        }
      }

      const nextPublicClient = createPublicClient({
        chain: activeChain.chain,
        transport: http(activeChain.rpcUrl),
      })
      const nextWalletClient = createWalletClient({
        account: selected,
        chain: activeChain.chain,
        transport: custom(window.ethereum),
      })

      setAccount(selected)
      setPublicClient(nextPublicClient)
      setWalletClient(nextWalletClient)
      let nextWave5Ready = true
      if (contractReady && silentVaultAddress) {
        try {
          await nextPublicClient.readContract({
            address: silentVaultAddress,
            abi: silentVaultAbi,
            functionName: "computeHiddenBeneficiaryCommitment",
            args: [selected, zeroBytes32],
          })
          nextWave5Ready = true
        } catch {
          nextWave5Ready = false
        }
        setWave5Ready(nextWave5Ready)
      }

      setStatus("Loading CoFHE client and preparing a decryption permit...")
      const [{ createCofheConfig, createCofheClient }, { chains }, sdk] = await Promise.all([
        import("@cofhe/sdk/web"),
        import("@cofhe/sdk/chains"),
        import("@cofhe/sdk"),
      ])
      const config = createCofheConfig({ supportedChains: [chains[activeChain.cofheKey]] })
      const client = createCofheClient(config)
      await client.connect(nextPublicClient as any, nextWalletClient as any)
      await client.permits.getOrCreateSelfPermit()

      setCofhe({ client, Encryptable: sdk.Encryptable, FheTypes: sdk.FheTypes })
      setStatus(
        nextWave5Ready
          ? "Wallet connected. CoFHE permit is ready for encrypted reads."
          : "Wallet connected to a legacy SilentVault contract. Deploy the Wave 5 contract before using new create features.",
      )
      await loadVaults(nextPublicClient, selected)
      await loadEvents(nextPublicClient, selected)
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Wallet connection failed.")
    } finally {
      setIsBusy(false)
    }
  }, [])

  const readVault = useCallback(
    async (client: PublicClient, vaultId: bigint, selectedAccount?: Address) => {
      if (!contractReady || !silentVaultAddress) throw new Error("Contract address is not configured")

      let view
      try {
        view = await client.readContract({
          address: silentVaultAddress,
          abi: silentVaultAbi,
          functionName: "getVault",
          args: [vaultId],
        })
      } catch {
        view = await client.readContract({
          address: silentVaultAddress,
          abi: silentVaultLegacyAbi,
          functionName: "getVault",
          args: [vaultId],
        })
      }

      const [heirs, hiddenCommitments, recoveryReady, unlockReady, currentUserApproved] = await Promise.all([
        client.readContract({
          address: silentVaultAddress,
          abi: silentVaultAbi,
          functionName: "getBeneficiaries",
          args: [vaultId],
        }),
        client.readContract({
          address: silentVaultAddress,
          abi: silentVaultAbi,
          functionName: "getHiddenBeneficiaryCommitments",
          args: [vaultId],
        }).catch(() => []),
        client.readContract({
          address: silentVaultAddress,
          abi: silentVaultAbi,
          functionName: "isRecoveryReady",
          args: [vaultId],
        }),
        client.readContract({
          address: silentVaultAddress,
          abi: silentVaultAbi,
          functionName: "canUnlock",
          args: [vaultId],
        }),
        selectedAccount
          ? client.readContract({
              address: silentVaultAddress,
              abi: silentVaultAbi,
              functionName: "hasApprovedRecovery",
              args: [vaultId, selectedAccount],
            }).catch(() => false)
          : Promise.resolve(false),
      ])

      return normalizeVault(
        view,
        heirs as any[],
        hiddenCommitments as string[],
        recoveryReady,
        unlockReady,
        Boolean(currentUserApproved),
      )
    },
    [contractReady],
  )

  const loadEvents = useCallback(
    async (client = publicClient, selectedAccount = account) => {
      if (!client || !selectedAccount || !contractReady || !silentVaultAddress) return

      try {
        const eventQueries = [
          ["VaultCreated", { owner: selectedAccount }],
          ["CheckIn", { owner: selectedAccount }],
          ["RecoveryStarted", { actor: selectedAccount }],
          ["RecoveryApproved", { actor: selectedAccount }],
          ["RecoveryCancelled", { owner: selectedAccount }],
          ["VaultUnlocked", { actor: selectedAccount }],
          ["BeneficiaryRotated", { owner: selectedAccount }],
          ["HiddenBeneficiaryRotated", { owner: selectedAccount }],
          ["HiddenBeneficiaryRevealed", { beneficiary: selectedAccount }],
        ] as const
        const latestBlock = await client.getBlockNumber()
        const fromBlock = latestBlock > 50_000n ? latestBlock - 50_000n : 0n
        const chunkSize = 45_000n
        const results = await Promise.all(
          eventQueries.map(async ([eventName, args]) => {
            const logs = []
            for (let startBlock = fromBlock; startBlock <= latestBlock; startBlock += chunkSize) {
              const endBlock = startBlock + chunkSize - 1n > latestBlock ? latestBlock : startBlock + chunkSize - 1n
              const chunkLogs = await (client as any)
                .getContractEvents({
                  address: silentVaultAddress,
                  abi: silentVaultAbi,
                  eventName,
                  args,
                  fromBlock: startBlock,
                  toBlock: endBlock,
                })
                .catch(() => [])
              logs.push(...chunkLogs)
            }
            return logs
          }),
        )
        const records = results
          .flat()
          .map((event: any): VaultEventRecord => ({
            id: `${event.transactionHash}-${event.logIndex}`,
            name: event.eventName,
            vaultId: String(event.args?.vaultId ?? "?"),
            txHash: event.transactionHash,
            blockNumber: String(event.blockNumber ?? 0n),
            logIndex: String(event.logIndex ?? 0),
          }))
          .sort((a, b) => {
            const blockDelta = BigInt(b.blockNumber) - BigInt(a.blockNumber)
            if (blockDelta !== 0n) return Number(blockDelta)
            return Number(BigInt(b.logIndex || "0") - BigInt(a.logIndex || "0"))
          })
          .slice(0, 18)

        setEvents(records)
        localStorage.setItem(`silentvault-events:${activeChain.id}:${selectedAccount}`, JSON.stringify(records))
      } catch {
        const cached = localStorage.getItem(`silentvault-events:${activeChain.id}:${selectedAccount}`)
        if (cached) setEvents(JSON.parse(cached))
      }
    },
    [account, contractReady, publicClient],
  )

  const loadVaults = useCallback(
    async (client = publicClient, selectedAccount = account) => {
      if (!client || !selectedAccount || !contractReady || !silentVaultAddress) return
      setIsBusy(true)
      try {
        const [ownedIds, beneficiaryIds] = await Promise.all([
          client.readContract({
            address: silentVaultAddress,
            abi: silentVaultAbi,
            functionName: "getVaultsByOwner",
            args: [selectedAccount],
          }),
          client.readContract({
            address: silentVaultAddress,
            abi: silentVaultAbi,
            functionName: "getVaultsByBeneficiary",
            args: [selectedAccount],
          }),
        ])

        const ids = Array.from(new Set([...(ownedIds as bigint[]), ...(beneficiaryIds as bigint[])].map(String))).map(
          BigInt,
        )
        const records = await Promise.all(ids.map((id) => readVault(client, id, selectedAccount)))
        records.sort((a, b) => Number(b.createdAt - a.createdAt))
        setVaults(records)
        await loadEvents(client, selectedAccount)
        setStatus(records.length ? "On-chain vault state refreshed." : "No vaults found for this wallet yet.")
      } catch (error: any) {
        setStatus(error?.shortMessage || error?.message || "Could not load vaults.")
      } finally {
        setIsBusy(false)
      }
    },
    [account, contractReady, loadEvents, publicClient, readVault],
  )

  async function submitVault() {
    if (!account || !publicClient || !walletClient || !cofhe) {
      setStatus("Connect your wallet before creating a vault.")
      return
    }
    if (!contractReady || !silentVaultAddress) {
      setStatus("Deploy SilentVault and set NEXT_PUBLIC_SILENT_VAULT_ADDRESS before creating vaults.")
      return
    }
    if (!wave5Ready) {
      setStatus("The configured contract is a legacy deployment. Deploy the Wave 5 contract before creating advanced vaults.")
      return
    }
    if (!secret.trim()) {
      setStatus("Add encrypted recovery instructions before creating the vault.")
      return
    }
    if (!Number.isInteger(assetCount) || assetCount < 1 || assetCount > 4_294_967_295) {
      setStatus("Private asset count must be a whole number between 1 and 4,294,967,295.")
      return
    }
    if (validBeneficiaries.length !== beneficiaries.length || !validBeneficiaries.length) {
      setStatus("Every beneficiary needs a valid wallet address.")
      return
    }
    if (hasDuplicateBeneficiaryWallets) {
      setStatus("Each beneficiary wallet must be unique, including hidden beneficiaries.")
      return
    }
    if (!beneficiarySharesValid) {
      setStatus("Each beneficiary share must be greater than 0% and no more than 100%.")
      return
    }
    if (shareTotalBps !== 10000) {
      setStatus("Beneficiary shares must add up to exactly 100%.")
      return
    }
    if (!Number.isInteger(approvalThreshold) || approvalThreshold < 1 || approvalThreshold > validBeneficiaries.length) {
      setStatus("Recovery approval threshold must be a whole number between 1 and the beneficiary count.")
      return
    }
    if (!Number.isInteger(timerIndex) || !timerPresets[timerIndex]) {
      setStatus("Choose a valid unlock condition.")
      return
    }
    if (hiddenBeneficiaries.some((beneficiary) => !isBytes32(beneficiary.salt))) {
      setStatus("Every hidden beneficiary needs a 32-byte claim salt.")
      return
    }
    if (externalPayloadHash && !isBytes32(externalPayloadHash)) {
      setStatus("External file hash must be a 32-byte hex value.")
      return
    }

    setIsBusy(true)
    try {
      const primaryBeneficiary = validBeneficiaries[0].wallet as Address
      const releaseCode = makeReleaseCode()
      setStatus("Encrypting recovery package locally with Web Crypto...")
      const notificationConfig = {
        email: notificationEmail.trim(),
        telegram: notificationTelegram.trim(),
        webhook: notificationWebhook.trim(),
        wallet: account,
      }
      const notificationHash =
        notificationConfig.email || notificationConfig.telegram || notificationConfig.webhook
          ? hashJson(notificationConfig)
          : zeroBytes32
      const proofOfLifeHash = proofOfLifePlan.trim() ? hashJson({ plan: proofOfLifePlan.trim() }) : zeroBytes32
      const recoveryPackage = JSON.stringify(
        {
          version: 2,
          instructions: secret,
          externalPayload: {
            cid: externalPayloadCid.trim(),
            sha256: externalPayloadHash || zeroBytes32,
          },
          notificationRelay: notificationConfig,
          proofOfLife: proofOfLifePlan.trim(),
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      )
      const encryptedPayload = await encryptVaultPayload(recoveryPackage, releaseCode, account, primaryBeneficiary)
      const payloadHash = keccak256(toBytes(encryptedPayload))
      const hiddenCommitments = hiddenBeneficiaries.map((beneficiary) =>
        keccak256(encodePacked(["address", "bytes32"], [beneficiary.wallet as Address, beneficiary.salt as `0x${string}`])),
      )

      setStatus("Creating CoFHE encrypted release secret, asset count, and primary beneficiary...")
      const [encryptedReleaseCode, encryptedAssetCount, encryptedPrimaryBeneficiary] = await cofhe.client
        .encryptInputs([
          cofhe.Encryptable.uint64(BigInt(releaseCode)),
          cofhe.Encryptable.uint32(BigInt(assetCount)),
          cofhe.Encryptable.address(primaryBeneficiary),
        ])
        .onStep((step: string, context: any) => {
          if (context?.isStart) setStatus(`CoFHE: ${step}`)
        })
        .execute()

      const preset = timerPresets[timerIndex]
      setStatus("Writing the encrypted vault to chain...")
      const hash = await (walletClient as any).writeContract({
        account,
        chain: activeChain.chain,
        address: silentVaultAddress,
        abi: silentVaultAbi,
        functionName: "createVaultAdvanced",
        args: [
          label,
          publicBeneficiaries.map((beneficiary) => beneficiary.wallet as Address),
          publicBeneficiaries.map((beneficiary) => toBps(beneficiary.share)),
          hiddenCommitments,
          hiddenBeneficiaries.map((beneficiary) => toBps(beneficiary.share)),
          {
            inactivityPeriod: BigInt(preset.inactivity),
            gracePeriod: BigInt(preset.grace),
            approvalThreshold,
          },
          {
            encryptedPayload,
            payloadHash,
            externalPayloadCid: externalPayloadCid.trim(),
            externalPayloadHash: externalPayloadHash || zeroBytes32,
            notificationHash,
            proofOfLifeHash,
          },
          encryptedReleaseCode,
          encryptedAssetCount,
          encryptedPrimaryBeneficiary,
        ],
      })

      setLastTx(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("Vault created on-chain. The payload is stored as ciphertext and the release secret is FHE-encrypted.")
      setHiddenClaimSummary(
        hiddenBeneficiaries.map(
          (beneficiary) => `${shortAddress(beneficiary.wallet)} claim salt: ${beneficiary.salt}`,
        ),
      )
      setSecret(initialSecret)
      await loadVaults(publicClient, account)
      router.push("/dashboard")
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Vault creation failed.")
    } finally {
      setIsBusy(false)
    }
  }

  async function writeVaultAction(vaultId: bigint, functionName: VaultWriteAction) {
    if (!account || !publicClient || !walletClient || !contractReady || !silentVaultAddress) return
    setIsBusy(true)
    try {
      setStatus(`Submitting ${functionName} transaction...`)
      const hash = await (walletClient as any).writeContract({
        account,
        chain: activeChain.chain,
        address: silentVaultAddress,
        abi: silentVaultAbi,
        functionName,
        args: [vaultId],
      })
      setLastTx(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("Transaction confirmed. Refreshing vault state.")
      await loadVaults(publicClient, account)
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Transaction failed.")
    } finally {
      setIsBusy(false)
    }
  }

  async function rotateBeneficiary(vaultId: bigint, oldWallet: Address, newWallet: string) {
    if (!account || !publicClient || !walletClient || !contractReady || !silentVaultAddress) return
    if (!isAddress(newWallet)) {
      setStatus("Enter a valid replacement beneficiary wallet.")
      return
    }

    setIsBusy(true)
    try {
      setStatus("Submitting beneficiary rotation transaction...")
      const hash = await (walletClient as any).writeContract({
        account,
        chain: activeChain.chain,
        address: silentVaultAddress,
        abi: silentVaultAbi,
        functionName: "rotateBeneficiary",
        args: [vaultId, oldWallet, newWallet as Address],
      })
      setLastTx(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("Beneficiary rotated on-chain. Pending recovery approvals were reset.")
      await loadVaults(publicClient, account)
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Beneficiary rotation failed.")
    } finally {
      setIsBusy(false)
    }
  }

  async function updateVaultMetadata(vault: VaultRecord, metadata: VaultMetadataDraft) {
    if (!account || !publicClient || !walletClient || !contractReady || !silentVaultAddress) return
    if (
      (metadata.externalPayloadHash && !isBytes32(metadata.externalPayloadHash)) ||
      (metadata.notificationHash && !isBytes32(metadata.notificationHash)) ||
      (metadata.proofOfLifeHash && !isBytes32(metadata.proofOfLifeHash))
    ) {
      setStatus("Metadata hashes must be 32-byte hex values.")
      return
    }

    setIsBusy(true)
    try {
      setStatus("Submitting vault metadata update...")
      const hash = await (walletClient as any).writeContract({
        account,
        chain: activeChain.chain,
        address: silentVaultAddress,
        abi: silentVaultAbi,
        functionName: "updateVaultMetadata",
        args: [
          vault.id,
          vault.encryptedPayload,
          vault.payloadHash,
          metadata.externalPayloadCid.trim(),
          (metadata.externalPayloadHash || zeroBytes32) as `0x${string}`,
          (metadata.notificationHash || zeroBytes32) as `0x${string}`,
          (metadata.proofOfLifeHash || zeroBytes32) as `0x${string}`,
        ],
      })
      setLastTx(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("Vault metadata updated on-chain.")
      await loadVaults(publicClient, account)
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Vault metadata update failed.")
    } finally {
      setIsBusy(false)
    }
  }

  async function rotateHiddenBeneficiary(vaultId: bigint, oldCommitment: string, newWallet: string, newSalt: string) {
    if (!account || !publicClient || !walletClient || !contractReady || !silentVaultAddress) return
    if (!isBytes32(oldCommitment) || !isAddress(newWallet) || !isBytes32(newSalt)) {
      setStatus("Choose an unrevealed commitment, replacement wallet, and 32-byte claim salt.")
      return
    }

    const newCommitment = keccak256(encodePacked(["address", "bytes32"], [newWallet as Address, newSalt as `0x${string}`]))
    setIsBusy(true)
    try {
      setStatus("Submitting hidden beneficiary commitment rotation...")
      const hash = await (walletClient as any).writeContract({
        account,
        chain: activeChain.chain,
        address: silentVaultAddress,
        abi: silentVaultAbi,
        functionName: "rotateHiddenBeneficiaryCommitment",
        args: [vaultId, oldCommitment as `0x${string}`, newCommitment],
      })
      setLastTx(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setHiddenClaimSummary([`${shortAddress(newWallet)} claim salt: ${newSalt}`])
      setStatus("Hidden beneficiary commitment rotated on-chain. Share the new claim salt privately.")
      await loadVaults(publicClient, account)
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Hidden beneficiary rotation failed.")
    } finally {
      setIsBusy(false)
    }
  }

  async function revealHiddenBeneficiary() {
    if (!account || !publicClient || !walletClient || !contractReady || !silentVaultAddress) return
    if (!/^[1-9]\d*$/.test(claimVaultId) || !isBytes32(claimSalt)) {
      setStatus("Enter a positive hidden vault id and a 32-byte claim salt.")
      return
    }

    setIsBusy(true)
    try {
      setStatus("Revealing hidden beneficiary claim on-chain...")
      const hash = await (walletClient as any).writeContract({
        account,
        chain: activeChain.chain,
        address: silentVaultAddress,
        abi: silentVaultAbi,
        functionName: "revealHiddenBeneficiary",
        args: [BigInt(claimVaultId), claimSalt as `0x${string}`],
      })
      setLastTx(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("Hidden beneficiary claim revealed. Refreshing assigned vaults.")
      await loadVaults(publicClient, account)
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Hidden beneficiary reveal failed.")
    } finally {
      setIsBusy(false)
    }
  }

  async function decryptVault(vault: VaultRecord) {
    if (!account || !publicClient || !cofhe || !contractReady || !silentVaultAddress) return
    setIsBusy(true)
    try {
      setStatus("Reading encrypted handles and using your CoFHE permit...")
      await cofhe.client.permits.getOrCreateSelfPermit()
      const [releaseCodeHandle, assetCountHandle, primaryBeneficiaryHandle] = await publicClient.readContract({
        address: silentVaultAddress,
        abi: silentVaultAbi,
        functionName: "getEncryptedHandles",
        args: [vault.id],
      })

      const releaseCode = await cofhe.client.decryptForView(releaseCodeHandle, cofhe.FheTypes.Uint64).execute()
      const decryptedAssetCount = await cofhe.client.decryptForView(assetCountHandle, cofhe.FheTypes.Uint32).execute()
      const primaryBeneficiary = await cofhe.client
        .decryptForView(primaryBeneficiaryHandle, cofhe.FheTypes.Uint160)
        .execute()
      const secretText = await decryptVaultPayload(
        vault.encryptedPayload,
        String(releaseCode),
        vault.owner,
        primaryBeneficiary,
      )

      setDecrypted((current) => ({
        ...current,
        [String(vault.id)]: {
          secret: secretText,
          releaseCode: String(releaseCode),
          assetCount: String(decryptedAssetCount),
          primaryBeneficiary,
        },
      }))
      setStatus("Decryption complete. The plaintext stayed local in this browser session.")
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Decryption failed. The wallet may not have ACL access yet.")
    } finally {
      setIsBusy(false)
    }
  }

  function addBeneficiary() {
    if (beneficiaries.length >= 8) return
    const nextShare = Math.floor(100 / (beneficiaries.length + 1))
    setBeneficiaries([
      ...beneficiaries.map((beneficiary) => ({ ...beneficiary, share: nextShare })),
      { wallet: "", share: 100 - nextShare * beneficiaries.length, hidden: false, salt: makeBytes32Salt() },
    ])
    setApprovalThreshold((current) => Math.min(current, beneficiaries.length + 1))
  }

  function updateBeneficiary(index: number, field: "wallet" | "share" | "salt", value: string) {
    setBeneficiaries((current) =>
      current.map((beneficiary, i) =>
        i === index ? { ...beneficiary, [field]: field === "share" ? Number(value) : value } : beneficiary,
      ),
    )
  }

  function toggleBeneficiaryHidden(index: number, hidden: boolean) {
    setBeneficiaries((current) =>
      current.map((beneficiary, i) =>
        i === index
          ? {
              ...beneficiary,
              hidden,
              salt: beneficiary.salt && isBytes32(beneficiary.salt) ? beneficiary.salt : makeBytes32Salt(),
            }
          : beneficiary,
      ),
    )
  }

  function removeBeneficiary(index: number) {
    setBeneficiaries((current) => current.filter((_, i) => i !== index))
    setApprovalThreshold((current) => Math.max(1, Math.min(current, beneficiaries.length - 1)))
  }

  function applyTemplate(body: string) {
    setSecret((current) => `${current}${body}`)
  }

  async function hashExternalPayload(file?: File) {
    if (!file) return
    setIsBusy(true)
    try {
      setStatus("Hashing file locally with SHA-256...")
      setExternalPayloadHash(await sha256Bytes32(file))
      setStatus("File hash ready. Upload the encrypted file to Lighthouse/IPFS and paste the CID.")
    } catch (error: any) {
      setStatus(error?.message || "Could not hash the selected file.")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f8f6] text-zinc-950">
      <section className="border-b border-zinc-200 bg-white/80 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950 text-white">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight">SilentVault</p>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Private legacy protocol</p>
            </div>
          </a>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
              {activeChain.shortName}
            </span>
            {contractReady ? (
              <a
                href={explorerAddress(silentVaultAddress || "")}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
              >
                Contract configured
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Contract address missing
              </span>
            )}
            {contractReady && !wave5Ready && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Legacy contract
              </span>
            )}
            <button
              onClick={connectWallet}
              disabled={isBusy}
              className="flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {account ? shortAddress(account) : "Connect wallet"}
            </button>
          </div>
        </div>
      </section>

      <section className="px-4 py-10">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-6">
            <div className="border-b border-zinc-200 pb-8">
              <p className="mb-4 text-sm uppercase tracking-[0.24em] text-zinc-500">Encrypted recovery console</p>
              <h1 className="font-serif text-5xl font-normal leading-tight md:text-7xl">Create, check in, unlock.</h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-zinc-600">
                Manage the complete on-chain flow from one place: encrypted vault setup, owner heartbeat, beneficiary
                recovery, emergency mode, and local decrypt after unlock.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 pb-6 md:grid-cols-4">
              <Metric icon={LockKeyhole} label="Owner vaults" value={account ? String(ownedVaults.length) : "--"} />
              <Metric icon={Users} label="Heir vaults" value={account ? String(beneficiaryVaults.length) : "--"} />
              <Metric icon={Radio} label="Network" value={activeChain.shortName} />
              <Metric icon={Database} label="Events" value={account ? String(events.length) : "--"} />
            </div>

            <div className="border-b border-zinc-200 pb-6">
              <div className="flex items-start gap-3">
                {isBusy ? (
                  <Loader2 className="mt-1 h-5 w-5 animate-spin text-zinc-500" />
                ) : (
                  <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-600" />
                )}
                <div>
                  <p className="text-sm font-medium text-zinc-900">Wallet and chain status</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">{status}</p>
                  {lastTx && (
                    <a
                      href={explorerTx(lastTx)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-sm font-medium text-zinc-950 underline underline-offset-4"
                    >
                      View latest transaction
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="border-b border-zinc-200 pb-6">
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Chain ID</span>
                  <span className="font-medium text-zinc-900">{activeChain.id}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Contract</span>
                  {silentVaultAddress ? (
                    <a
                      href={explorerAddress(silentVaultAddress)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs font-medium text-zinc-950 underline underline-offset-4"
                    >
                      {shortAddress(silentVaultAddress)}
                    </a>
                  ) : (
                    <span className="text-amber-600">Missing</span>
                  )}
                </div>
              </div>
            </div>

                {hiddenClaimSummary.length > 0 && (
              <div className="border-b border-zinc-200 pb-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900">Hidden claim salts</p>
                  <button
                    onClick={() => navigator.clipboard?.writeText(hiddenClaimSummary.join("\n"))}
                    className="text-xs font-medium text-zinc-950 underline underline-offset-4"
                  >
                    Copy all
                  </button>
                </div>
                <div className="space-y-2">
                  {hiddenClaimSummary.map((claim) => (
                    <p key={claim} className="break-all rounded-2xl bg-white p-3 font-mono text-xs text-zinc-600">
                      {claim}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[30px] border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-2 gap-2 p-1 md:grid-cols-4">
              {[
                ["overview", "Dashboard", "/dashboard"],
                ["create", "Create vault", "/dashboard/create"],
                ["beneficiary", "Beneficiary", "/dashboard/beneficiary"],
                ["roadmap", "Roadmap", "/dashboard/roadmap"],
              ].map(([id, title, href]) => (
                <Link
                  key={id}
                  href={href}
                  className={`rounded-full px-4 py-3 text-sm transition ${
                    activeView === id ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {title}
                </Link>
              ))}
            </div>

            {activeView === "overview" && (
              <div className="space-y-4 p-3 md:p-5">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-5">
                  <div>
                    <h2 className="font-serif text-3xl font-normal">Vault dashboard</h2>
                    <p className="mt-1 text-sm text-zinc-500">Owner controls, beneficiary unlocks, encrypted reads.</p>
                  </div>
                  <button
                    onClick={() => loadVaults()}
                    disabled={!account || isBusy}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
                    title="Refresh vaults"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
                <VaultList
                  emptyText="No owner vaults yet. Create one and it will appear here."
                  title="Owned vaults"
                  vaults={ownedVaults}
                  account={account}
                  decrypted={decrypted}
                  onAction={writeVaultAction}
                  onDecrypt={decryptVault}
                  onRotate={rotateBeneficiary}
                  onRotateHidden={rotateHiddenBeneficiary}
                  onUpdateMetadata={updateVaultMetadata}
                />
                <EventTimeline events={events} onRefresh={() => loadEvents()} />
              </div>
            )}

            {activeView === "create" && (
              <div className="space-y-5 p-3 md:p-5">
                <div className="border-b border-zinc-100 pb-5">
                  <h2 className="font-serif text-3xl font-normal">Create vault</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    The encrypted payload and FHE handles are written directly to the contract.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-zinc-700">Vault label</span>
                    <input
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-zinc-700">Private asset count</span>
                    <input
                      type="number"
                      min={1}
                      value={assetCount}
                      onChange={(event) => setAssetCount(Number(event.target.value))}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Unlock condition</span>
                  <select
                    value={timerIndex}
                    onChange={(event) => setTimerIndex(Number(event.target.value))}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                  >
                    {timerPresets.map((preset, index) => (
                      <option key={preset.label} value={index}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Recovery approvals required</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, beneficiaries.length)}
                    value={approvalThreshold}
                    onChange={(event) => setApprovalThreshold(Number(event.target.value))}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                  />
                  <span className="block text-xs text-zinc-500">
                    {approvalThreshold} of {beneficiaries.length} beneficiary slots must approve before non-emergency unlock.
                  </span>
                </label>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-700">Beneficiaries</span>
                    <button onClick={addBeneficiary} className="text-sm font-medium text-zinc-950 underline underline-offset-4">
                      Add heir
                    </button>
                  </div>
                  {beneficiaries.map((beneficiary, index) => (
                    <div key={index} className="rounded-3xl border border-zinc-200 bg-[#fbfbfa] p-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_110px_120px_42px]">
                      <input
                        value={beneficiary.wallet}
                        onChange={(event) => updateBeneficiary(index, "wallet", event.target.value)}
                        placeholder="0x beneficiary wallet"
                        aria-label={`Beneficiary ${index + 1} wallet`}
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={beneficiary.share}
                        onChange={(event) => updateBeneficiary(index, "share", event.target.value)}
                        aria-label={`Beneficiary ${index + 1} share percentage`}
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                      />
                      <label className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={beneficiary.hidden}
                          onChange={(event) => toggleBeneficiaryHidden(index, event.target.checked)}
                          className="h-4 w-4"
                        />
                        Hidden
                      </label>
                      <button
                        onClick={() => removeBeneficiary(index)}
                        disabled={beneficiaries.length === 1}
                        className="flex h-12 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-40"
                        aria-label={`Remove beneficiary ${index + 1}`}
                        title="Remove beneficiary"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                      </div>
                      {beneficiary.hidden && (
                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_42px]">
                          <input
                            value={beneficiary.salt}
                            onChange={(event) => updateBeneficiary(index, "salt", event.target.value)}
                            aria-label={`Beneficiary ${index + 1} hidden claim salt`}
                            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-zinc-500"
                          />
                          <button
                            onClick={() => updateBeneficiary(index, "salt", makeBytes32Salt())}
                            className="flex h-12 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50"
                            aria-label={`Regenerate beneficiary ${index + 1} claim salt`}
                            title="Regenerate claim salt"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <p className={`text-sm ${shareTotalBps === 10000 ? "text-emerald-600" : "text-amber-600"}`}>
                    Distribution total: {shareTotal}%
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Secret recovery package</span>
                  <div className="flex flex-wrap gap-2">
                    {recoveryTemplates.map((template) => (
                      <button
                        key={template.label}
                        onClick={() => applyTemplate(template.body)}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:text-zinc-950"
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    rows={8}
                    className="w-full resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-4 text-sm leading-6 outline-none transition focus:border-zinc-500"
                  />
                </div>

                <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-[#fbfbfa] p-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-zinc-700">Encrypted file CID</span>
                    <input
                      value={externalPayloadCid}
                      onChange={(event) => setExternalPayloadCid(event.target.value)}
                      placeholder="ipfs:// or lighthouse cid"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-zinc-700">File hash anchor</span>
                    <input
                      value={externalPayloadHash}
                      onChange={(event) => setExternalPayloadHash(event.target.value)}
                      placeholder={zeroBytes32}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-zinc-500"
                    />
                  </label>
                  <label className="md:col-span-2">
                    <span className="flex items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-4 text-sm font-medium text-zinc-700">
                      <FileArchive className="h-4 w-4" />
                      Hash a local file before uploading
                      <input
                        type="file"
                        className="sr-only"
                        onChange={(event) => hashExternalPayload(event.target.files?.[0])}
                      />
                    </span>
                  </label>
                </div>

                <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-[#fbfbfa] p-4 md:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-zinc-700">Email alert</span>
                    <input
                      value={notificationEmail}
                      onChange={(event) => setNotificationEmail(event.target.value)}
                      placeholder="heir@example.com"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-zinc-700">Telegram chat</span>
                    <input
                      value={notificationTelegram}
                      onChange={(event) => setNotificationTelegram(event.target.value)}
                      placeholder="@handle or chat id"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-zinc-700">Webhook</span>
                    <input
                      value={notificationWebhook}
                      onChange={(event) => setNotificationWebhook(event.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Proof-of-life plan</span>
                  <textarea
                    value={proofOfLifePlan}
                    onChange={(event) => setProofOfLifePlan(event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-4 text-sm leading-6 outline-none transition focus:border-zinc-500"
                  />
                </label>

                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  Never paste a seed phrase directly unless this vault is the final sealed place you intend to store it.
                  Prefer recovery instructions, hardware-wallet locations, legal contacts, and verification steps.
                </div>

                <button
                  onClick={submitVault}
                  disabled={isBusy || !account}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-950 px-6 py-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Encrypt and create on-chain vault
                </button>
              </div>
            )}

            {activeView === "beneficiary" && (
              <div className="space-y-4 p-3 md:p-5">
                <div className="border-b border-zinc-100 pb-5">
                  <h2 className="font-serif text-3xl font-normal">Beneficiary access</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Start recovery after inactivity, unlock after grace, then decrypt locally.
                  </p>
                </div>
                <div className="grid gap-3 rounded-3xl border border-zinc-200 bg-[#fbfbfa] p-4 md:grid-cols-[120px_1fr_auto]">
                  <input
                    value={claimVaultId}
                    onChange={(event) => setClaimVaultId(event.target.value)}
                    placeholder="Vault id"
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                  />
                  <input
                    value={claimSalt}
                    onChange={(event) => setClaimSalt(event.target.value)}
                    placeholder="Hidden claim salt"
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-zinc-500"
                  />
                  <button
                    onClick={revealHiddenBeneficiary}
                    disabled={!account || isBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
                  >
                    <Fingerprint className="h-4 w-4" />
                    Reveal claim
                  </button>
                </div>
                <VaultList
                  emptyText="No beneficiary vaults found for this wallet."
                  title="Assigned vaults"
                  vaults={beneficiaryVaults}
                  account={account}
                  decrypted={decrypted}
                  onAction={writeVaultAction}
                  onDecrypt={decryptVault}
                  onRotate={rotateBeneficiary}
                  onRotateHidden={rotateHiddenBeneficiary}
                  onUpdateMetadata={updateVaultMetadata}
                />
              </div>
            )}

            {activeView === "roadmap" && (
              <div className="space-y-5 p-3 md:p-5">
                <div className="border-b border-zinc-100 pb-5">
                  <h2 className="font-serif text-3xl font-normal">Roadmap</h2>
                  <p className="mt-1 text-sm text-zinc-500">Finished MVP surface plus production extensions.</p>
                </div>
                <Roadmap />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="py-2">
      <Icon className="mb-4 h-5 w-5 text-zinc-500" />
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
    </div>
  )
}

function VaultList({
  title,
  emptyText,
  vaults,
  account,
  decrypted,
  onAction,
  onDecrypt,
  onRotate,
  onRotateHidden,
  onUpdateMetadata,
}: {
  title: string
  emptyText: string
  vaults: VaultRecord[]
  account?: Address
  decrypted: Record<string, DecryptedVault>
  onAction: (vaultId: bigint, functionName: VaultWriteAction) => void
  onDecrypt: (vault: VaultRecord) => void
  onRotate: (vaultId: bigint, oldWallet: Address, newWallet: string) => void
  onRotateHidden: (vaultId: bigint, oldCommitment: string, newWallet: string, newSalt: string) => void
  onUpdateMetadata: (vault: VaultRecord, metadata: VaultMetadataDraft) => void
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">{title}</h3>
      {vaults.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-zinc-200 p-8 text-center">
          <EyeOff className="mx-auto mb-3 h-6 w-6 text-zinc-400" />
          <p className="text-sm text-zinc-500">{emptyText}</p>
        </div>
      )}
      {vaults.map((vault) => (
        <VaultRow
          key={String(vault.id)}
          vault={vault}
          account={account}
          decrypted={decrypted[String(vault.id)]}
          onAction={onAction}
          onDecrypt={onDecrypt}
          onRotate={onRotate}
          onRotateHidden={onRotateHidden}
          onUpdateMetadata={onUpdateMetadata}
        />
      ))}
    </div>
  )
}

function VaultRow({
  vault,
  account,
  decrypted,
  onAction,
  onDecrypt,
  onRotate,
  onRotateHidden,
  onUpdateMetadata,
}: {
  vault: VaultRecord
  account?: Address
  decrypted?: DecryptedVault
  onAction: (vaultId: bigint, functionName: VaultWriteAction) => void
  onDecrypt: (vault: VaultRecord) => void
  onRotate: (vaultId: bigint, oldWallet: Address, newWallet: string) => void
  onRotateHidden: (vaultId: bigint, oldCommitment: string, newWallet: string, newSalt: string) => void
  onUpdateMetadata: (vault: VaultRecord, metadata: VaultMetadataDraft) => void
}) {
  const visibleBeneficiaries = vault.beneficiaries.filter((beneficiary) => !isZeroAddress(beneficiary.wallet))
  const [rotationTarget, setRotationTarget] = useState<Address>(visibleBeneficiaries[0]?.wallet)
  const [rotationWallet, setRotationWallet] = useState("")
  const hiddenSlotOffset = Math.max(0, vault.beneficiaries.length - vault.hiddenCommitments.length)
  const unrevealedHiddenCommitments = vault.hiddenCommitments.filter((_, index) =>
    isZeroAddress(vault.beneficiaries[hiddenSlotOffset + index]?.wallet || zeroAddress),
  )
  const [hiddenRotationTarget, setHiddenRotationTarget] = useState(unrevealedHiddenCommitments[0] || "")
  const [hiddenRotationWallet, setHiddenRotationWallet] = useState("")
  const [hiddenRotationSalt, setHiddenRotationSalt] = useState(() => makeBytes32Salt())
  const [metadataDraft, setMetadataDraft] = useState<VaultMetadataDraft>({
    externalPayloadCid: vault.externalPayloadCid,
    externalPayloadHash: vault.externalPayloadHash === zeroBytes32 ? "" : vault.externalPayloadHash,
    notificationHash: vault.notificationHash === zeroBytes32 ? "" : vault.notificationHash,
    proofOfLifeHash: vault.proofOfLifeHash === zeroBytes32 ? "" : vault.proofOfLifeHash,
  })
  const status = statusFor(vault)
  const StatusIcon = status.icon
  const isOwner = account && vault.owner.toLowerCase() === account.toLowerCase()
  const isBeneficiary =
    account && vault.beneficiaries.some((beneficiary) => beneficiary.wallet.toLowerCase() === account.toLowerCase())
  const canDecrypt = Boolean(isOwner || (isBeneficiary && vault.unlocked))

  useEffect(() => {
    if (rotationTarget && visibleBeneficiaries.some((beneficiary) => beneficiary.wallet === rotationTarget)) return
    setRotationTarget(visibleBeneficiaries[0]?.wallet)
  }, [rotationTarget, visibleBeneficiaries])

  useEffect(() => {
    if (hiddenRotationTarget && unrevealedHiddenCommitments.includes(hiddenRotationTarget)) return
    setHiddenRotationTarget(unrevealedHiddenCommitments[0] || "")
  }, [hiddenRotationTarget, unrevealedHiddenCommitments])

  useEffect(() => {
    setMetadataDraft({
      externalPayloadCid: vault.externalPayloadCid,
      externalPayloadHash: vault.externalPayloadHash === zeroBytes32 ? "" : vault.externalPayloadHash,
      notificationHash: vault.notificationHash === zeroBytes32 ? "" : vault.notificationHash,
      proofOfLifeHash: vault.proofOfLifeHash === zeroBytes32 ? "" : vault.proofOfLifeHash,
    })
  }, [vault.externalPayloadCid, vault.externalPayloadHash, vault.notificationHash, vault.proofOfLifeHash])

  return (
    <article className="rounded-[28px] border border-zinc-200 bg-[#fbfbfa] p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs text-zinc-500">Vault #{String(vault.id)}</span>
          </div>
          <h4 className="text-xl font-semibold tracking-tight">{vault.label || "Untitled vault"}</h4>
          <p className="mt-2 break-all text-xs text-zinc-500">Payload hash: {vault.payloadHash}</p>
        </div>
        <button
          onClick={() => navigator.clipboard?.writeText(vault.payloadHash)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:text-zinc-950"
          title="Copy payload hash"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <VaultFact icon={HeartPulse} label="Last check-in" value={dateText(vault.lastCheckIn)} />
        <VaultFact icon={Timer} label="Inactivity" value={secondsToText(vault.inactivityPeriod)} />
        <VaultFact icon={Shield} label="Grace" value={secondsToText(vault.gracePeriod)} />
        <VaultFact icon={Users} label="Heirs" value={String(vault.beneficiaryCount)} />
        <VaultFact icon={UserCheck} label="Approvals" value={`${vault.recoveryApprovals}/${vault.approvalThreshold}`} />
      </div>

      <div className="mt-5 rounded-[20px] bg-white p-4">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Distribution</p>
        <div className="space-y-2">
          {vault.beneficiaries.map((beneficiary, index) => (
            <div key={`${beneficiary.wallet}-${index}`} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-mono text-xs text-zinc-600">
                {isZeroAddress(beneficiary.wallet) ? "Hidden until claim" : shortAddress(beneficiary.wallet)}
              </span>
              <span className="font-medium">{beneficiary.shareBps / 100}%</span>
            </div>
          ))}
        </div>
      </div>

      {(vault.externalPayloadCid ||
        vault.externalPayloadHash !== zeroBytes32 ||
        vault.notificationHash !== zeroBytes32 ||
        vault.proofOfLifeHash !== zeroBytes32) && (
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {vault.externalPayloadCid && <VaultFact icon={FileArchive} label="File CID" value={vault.externalPayloadCid} />}
          {vault.externalPayloadHash !== zeroBytes32 && (
            <VaultFact icon={FileCheck2} label="File hash" value={shortAddress(vault.externalPayloadHash)} />
          )}
          {vault.notificationHash !== zeroBytes32 && (
            <VaultFact icon={Bell} label="Notify hash" value={shortAddress(vault.notificationHash)} />
          )}
          {vault.proofOfLifeHash !== zeroBytes32 && (
            <VaultFact icon={CalendarClock} label="Life proof" value={shortAddress(vault.proofOfLifeHash)} />
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {isOwner && !vault.unlocked && (
          <>
            <ActionButton icon={HeartPulse} label="I'm active" onClick={() => onAction(vault.id, "checkIn")} />
            <ActionButton icon={AlertTriangle} label="Emergency" onClick={() => onAction(vault.id, "triggerEmergency")} />
          </>
        )}
        {vault.triggerStartedAt > 0n && isOwner && !vault.unlocked && (
          <ActionButton icon={Ban} label="Cancel" onClick={() => onAction(vault.id, "cancelRecovery")} />
        )}
        {isBeneficiary && !vault.unlocked && vault.recoveryReady && vault.triggerStartedAt === 0n && (
          <ActionButton icon={Play} label="Start recovery" onClick={() => onAction(vault.id, "startRecovery")} />
        )}
        {isBeneficiary &&
          !vault.unlocked &&
          vault.triggerStartedAt > 0n &&
          !vault.emergencyMode &&
          vault.recoveryApprovals < vault.approvalThreshold &&
          !vault.currentUserApproved && (
            <ActionButton icon={UserCheck} label="Approve" onClick={() => onAction(vault.id, "approveRecovery")} />
          )}
        {isBeneficiary && !vault.unlocked && vault.unlockReady && (
          <ActionButton icon={Unlock} label="Unlock" onClick={() => onAction(vault.id, "unlockVault")} />
        )}
        {canDecrypt && (
          <ActionButton icon={FileText} label="Decrypt" onClick={() => onDecrypt(vault)} primary={vault.unlocked} />
        )}
        {vault.unlocked && (isOwner || isBeneficiary) && (
          <ActionButton icon={Shield} label="Grant access" onClick={() => onAction(vault.id, "grantUnlockedAccess")} />
        )}
      </div>

      {isOwner && !vault.unlocked && (
        <details className="mt-5 rounded-[20px] bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">Update vault anchors</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={metadataDraft.externalPayloadCid}
              onChange={(event) => setMetadataDraft((current) => ({ ...current, externalPayloadCid: event.target.value }))}
              placeholder="Encrypted file CID"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
            />
            <input
              value={metadataDraft.externalPayloadHash}
              onChange={(event) => setMetadataDraft((current) => ({ ...current, externalPayloadHash: event.target.value }))}
              placeholder="File hash bytes32"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-zinc-500"
            />
            <input
              value={metadataDraft.notificationHash}
              onChange={(event) => setMetadataDraft((current) => ({ ...current, notificationHash: event.target.value }))}
              placeholder="Notification hash bytes32"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-zinc-500"
            />
            <input
              value={metadataDraft.proofOfLifeHash}
              onChange={(event) => setMetadataDraft((current) => ({ ...current, proofOfLifeHash: event.target.value }))}
              placeholder="Proof-of-life hash bytes32"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-zinc-500"
            />
            <button
              onClick={() => onUpdateMetadata(vault, metadataDraft)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 px-5 py-3 text-sm font-medium text-zinc-700 transition hover:text-zinc-950 md:col-span-2"
            >
              <FileCheck2 className="h-4 w-4" />
              Save metadata
            </button>
          </div>
        </details>
      )}

      {isOwner && !vault.unlocked && visibleBeneficiaries.length > 0 && (
        <div className="mt-5 grid gap-3 rounded-[20px] bg-white p-4 md:grid-cols-[1fr_1fr_auto]">
          <select
            value={rotationTarget || ""}
            onChange={(event) => setRotationTarget(event.target.value as Address)}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
          >
            {visibleBeneficiaries.map((beneficiary) => (
              <option key={beneficiary.wallet} value={beneficiary.wallet}>
                {shortAddress(beneficiary.wallet)}
              </option>
            ))}
          </select>
          <input
            value={rotationWallet}
            onChange={(event) => setRotationWallet(event.target.value)}
            placeholder="Replacement wallet"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
          />
          <button
            onClick={() => rotationTarget && onRotate(vault.id, rotationTarget, rotationWallet)}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 px-5 py-3 text-sm font-medium text-zinc-700 transition hover:text-zinc-950"
          >
            <RefreshCw className="h-4 w-4" />
            Rotate
          </button>
        </div>
      )}

      {isOwner && !vault.unlocked && unrevealedHiddenCommitments.length > 0 && (
        <div className="mt-5 grid gap-3 rounded-[20px] bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
          <select
            value={hiddenRotationTarget}
            onChange={(event) => setHiddenRotationTarget(event.target.value)}
            aria-label="Hidden commitment to rotate"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-zinc-500"
          >
            {unrevealedHiddenCommitments.map((commitment) => (
              <option key={commitment} value={commitment}>
                {shortAddress(commitment)}
              </option>
            ))}
          </select>
          <input
            value={hiddenRotationWallet}
            onChange={(event) => setHiddenRotationWallet(event.target.value)}
            placeholder="New hidden wallet"
            aria-label="New hidden beneficiary wallet"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
          />
          <input
            value={hiddenRotationSalt}
            onChange={(event) => setHiddenRotationSalt(event.target.value)}
            aria-label="New hidden claim salt"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-xs outline-none transition focus:border-zinc-500"
          />
          <button
            onClick={() => {
              onRotateHidden(vault.id, hiddenRotationTarget, hiddenRotationWallet, hiddenRotationSalt)
              setHiddenRotationSalt(makeBytes32Salt())
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 px-5 py-3 text-sm font-medium text-zinc-700 transition hover:text-zinc-950"
          >
            <RefreshCw className="h-4 w-4" />
            Rotate hidden
          </button>
        </div>
      )}

      {vault.triggerStartedAt > 0n && (
        <p className="mt-4 text-sm text-zinc-600">
          Recovery started at {dateText(vault.triggerStartedAt)}. Unlock ready after{" "}
          {dateText(vault.triggerStartedAt + vault.gracePeriod)}.
        </p>
      )}

      {decrypted && (
        <div className="mt-5 rounded-[22px] border border-emerald-100 bg-emerald-50 p-4">
          <div className="mb-3 grid gap-2 text-sm md:grid-cols-3">
            <span>Release secret: {decrypted.releaseCode}</span>
            <span>Private assets: {decrypted.assetCount}</span>
            <span>Primary: {shortAddress(decrypted.primaryBeneficiary)}</span>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm leading-6 text-zinc-700">
            {decrypted.secret}
          </pre>
        </div>
      )}
    </article>
  )
}

function VaultFact({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-white p-3">
      <Icon className="mb-3 h-4 w-4 text-zinc-500" />
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-800">{value}</p>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: any
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition ${
        primary ? "bg-zinc-950 text-white hover:bg-zinc-800" : "border border-zinc-200 bg-white text-zinc-700 hover:text-zinc-950"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function EventTimeline({ events, onRefresh }: { events: VaultEventRecord[]; onRefresh: () => void }) {
  return (
    <div className="space-y-3 rounded-[24px] border border-zinc-200 bg-[#fbfbfa] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-950">Event timeline</p>
          <p className="mt-1 text-xs text-zinc-500">Indexed from contract logs and cached in this browser.</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:text-zinc-950"
          title="Refresh event timeline"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-5 text-sm text-zinc-500">
          No indexed events for this wallet yet.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <a
              key={event.id}
              href={explorerTx(event.txHash)}
              target="_blank"
              rel="noreferrer"
              className="grid gap-2 rounded-2xl bg-white p-3 text-sm transition hover:bg-zinc-50 md:grid-cols-[1fr_auto]"
            >
              <span className="font-medium text-zinc-900">
                {event.name} on vault #{event.vaultId}
              </span>
              <span className="font-mono text-xs text-zinc-500">block {event.blockNumber}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function Roadmap() {
  const items = [
    ["Done", "CoFHE contract", "Encrypted release secret, private asset count, hidden primary beneficiary, ACL unlock."],
    ["Done", "Multi-approval recovery", "Optional M-of-N beneficiary approval before non-emergency unlock."],
    ["Done", "Beneficiary rotation", "Owner can replace an unreleased beneficiary wallet and reset pending approvals."],
    ["Done", "Hidden beneficiaries", "Commitment-based beneficiary slots stay unrevealed until claim salt reveal."],
    ["Done", "Large-file anchors", "Lighthouse/IPFS CID and SHA-256 file hash can be anchored with the encrypted vault."],
    ["Done", "Event timeline", "Contract logs are indexed and cached in the browser for faster dashboard context."],
  ]

  return (
    <div className="space-y-3">
      {items.map(([status, title, body]) => (
        <div key={title} className="grid gap-3 rounded-[24px] border border-zinc-200 bg-[#fbfbfa] p-4 md:grid-cols-[86px_1fr]">
          <span
            className={`h-fit rounded-full px-3 py-1 text-center text-xs font-medium ${
              status === "Done" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {status}
          </span>
          <div>
            <p className="font-medium text-zinc-950">{title}</p>
            <p className="mt-1 text-sm leading-6 text-zinc-600">{body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

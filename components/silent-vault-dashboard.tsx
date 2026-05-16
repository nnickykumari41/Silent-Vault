"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  EyeOff,
  FileText,
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
  Users,
  Wallet,
} from "lucide-react"
import {
  createPublicClient,
  createWalletClient,
  custom,
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
  explorerTx,
  hasContractAddress,
  silentVaultAbi,
  silentVaultAddress,
} from "@/lib/silent-vault"
import { decryptVaultPayload, encryptVaultPayload, makeReleaseCode } from "@/lib/vault-crypto"

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
  beneficiaries: Beneficiary[]
  recoveryReady: boolean
  unlockReady: boolean
}

type DecryptedVault = {
  secret: string
  releaseCode: string
  assetCount: string
  primaryBeneficiary: string
}

type CofheRuntime = {
  client: any
  Encryptable: any
  FheTypes: any
}

type SilentVaultView = "overview" | "create" | "beneficiary" | "roadmap"

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
  "Recovery instructions:\n- Hardware wallet is in the bank locker.\n- Use the release code to decrypt this note.\n- Contact the second beneficiary before moving funds."

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

function statusFor(vault: VaultRecord) {
  if (vault.unlocked) return { label: "Unlocked", className: "bg-emerald-50 text-emerald-700", icon: Unlock }
  if (vault.emergencyMode) return { label: "Emergency", className: "bg-rose-50 text-rose-700", icon: AlertTriangle }
  if (vault.triggerStartedAt > 0n) return { label: "Grace period", className: "bg-amber-50 text-amber-700", icon: Timer }
  return { label: "Locked", className: "bg-zinc-100 text-zinc-700", icon: LockKeyhole }
}

function toBps(share: number) {
  return Math.round(share * 100)
}

function normalizeVault(view: any, beneficiaries: any[], recoveryReady: boolean, unlockReady: boolean): VaultRecord {
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
    beneficiaries: beneficiaries.map((beneficiary: any) => ({
      wallet: getTupleValue<Address>(beneficiary, "wallet", 0),
      shareBps: Number(getTupleValue<bigint | number>(beneficiary, "shareBps", 1)),
    })),
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
  const [decrypted, setDecrypted] = useState<Record<string, DecryptedVault>>({})
  const [isBusy, setIsBusy] = useState(false)
  const [status, setStatus] = useState("Connect a wallet to create or manage a private recovery vault.")
  const [lastTx, setLastTx] = useState<string>()
  const [label, setLabel] = useState("Family recovery vault")
  const [assetCount, setAssetCount] = useState(7)
  const [timerIndex, setTimerIndex] = useState(0)
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>([{ wallet: "", share: 100 }])
  const [secret, setSecret] = useState(initialSecret)

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
  const shareTotal = beneficiaries.reduce((sum, beneficiary) => sum + Number(beneficiary.share || 0), 0)

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
      setStatus("Wallet connected. CoFHE permit is ready for encrypted reads.")
      await loadVaults(nextPublicClient, selected)
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Wallet connection failed.")
    } finally {
      setIsBusy(false)
    }
  }, [])

  const readVault = useCallback(
    async (client: PublicClient, vaultId: bigint) => {
      if (!contractReady || !silentVaultAddress) throw new Error("Contract address is not configured")

      const [view, heirs, recoveryReady, unlockReady] = await Promise.all([
        client.readContract({
          address: silentVaultAddress,
          abi: silentVaultAbi,
          functionName: "getVault",
          args: [vaultId],
        }),
        client.readContract({
          address: silentVaultAddress,
          abi: silentVaultAbi,
          functionName: "getBeneficiaries",
          args: [vaultId],
        }),
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
      ])

      return normalizeVault(view, heirs as any[], recoveryReady, unlockReady)
    },
    [contractReady],
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
        const records = await Promise.all(ids.map((id) => readVault(client, id)))
        records.sort((a, b) => Number(b.createdAt - a.createdAt))
        setVaults(records)
        setStatus(records.length ? "On-chain vault state refreshed." : "No vaults found for this wallet yet.")
      } catch (error: any) {
        setStatus(error?.shortMessage || error?.message || "Could not load vaults.")
      } finally {
        setIsBusy(false)
      }
    },
    [account, contractReady, publicClient, readVault],
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
    if (!secret.trim()) {
      setStatus("Add encrypted recovery instructions before creating the vault.")
      return
    }
    if (validBeneficiaries.length !== beneficiaries.length || !validBeneficiaries.length) {
      setStatus("Every beneficiary needs a valid wallet address.")
      return
    }
    if (Math.round(shareTotal * 100) !== 10000) {
      setStatus("Beneficiary shares must add up to exactly 100%.")
      return
    }

    setIsBusy(true)
    try {
      const primaryBeneficiary = validBeneficiaries[0].wallet as Address
      const releaseCode = makeReleaseCode()
      setStatus("Encrypting recovery package locally with Web Crypto...")
      const encryptedPayload = await encryptVaultPayload(secret, releaseCode, account, primaryBeneficiary)
      const payloadHash = keccak256(toBytes(encryptedPayload))

      setStatus("Creating CoFHE encrypted release code, asset count, and primary beneficiary...")
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
        functionName: "createVault",
        args: [
          label,
          validBeneficiaries.map((beneficiary) => beneficiary.wallet as Address),
          validBeneficiaries.map((beneficiary) => toBps(beneficiary.share)),
          BigInt(preset.inactivity),
          BigInt(preset.grace),
          encryptedPayload,
          payloadHash,
          encryptedReleaseCode,
          encryptedAssetCount,
          encryptedPrimaryBeneficiary,
        ],
      })

      setLastTx(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("Vault created on-chain. The payload is stored as ciphertext and the release code is FHE-encrypted.")
      setSecret(initialSecret)
      await loadVaults(publicClient, account)
      router.push("/dashboard")
    } catch (error: any) {
      setStatus(error?.shortMessage || error?.message || "Vault creation failed.")
    } finally {
      setIsBusy(false)
    }
  }

  async function writeVaultAction(vaultId: bigint, functionName: "checkIn" | "startRecovery" | "triggerEmergency" | "cancelRecovery" | "unlockVault" | "grantUnlockedAccess") {
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
        vault.beneficiaries[0]?.wallet || primaryBeneficiary,
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
      { wallet: "", share: 100 - nextShare * beneficiaries.length },
    ])
  }

  function updateBeneficiary(index: number, field: keyof BeneficiaryDraft, value: string) {
    setBeneficiaries((current) =>
      current.map((beneficiary, i) =>
        i === index ? { ...beneficiary, [field]: field === "share" ? Number(value) : value } : beneficiary,
      ),
    )
  }

  function removeBeneficiary(index: number) {
    setBeneficiaries((current) => current.filter((_, i) => i !== index))
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
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Contract configured
              </span>
            ) : (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Contract address missing
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
              <p className="mb-4 text-sm uppercase tracking-[0.24em] text-zinc-500">On-chain dead-man switch</p>
              <h1 className="font-serif text-5xl font-normal leading-tight md:text-7xl">Private inheritance that waits.</h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-zinc-600">
                Create encrypted recovery instructions, assign heirs, check in while active, and release access only
                after inactivity or an owner-triggered emergency.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Metric icon={LockKeyhole} label="Owned" value={String(ownedVaults.length)} />
              <Metric icon={Users} label="Beneficiary" value={String(beneficiaryVaults.length)} />
              <Metric icon={Radio} label="Network" value={activeChain.shortName} />
            </div>

            <div className="rounded-[28px] border border-zinc-200 bg-white p-5">
              <div className="flex items-start gap-3">
                {isBusy ? (
                  <Loader2 className="mt-1 h-5 w-5 animate-spin text-zinc-500" />
                ) : (
                  <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-600" />
                )}
                <div>
                  <p className="text-sm font-medium text-zinc-900">System status</p>
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
                />
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

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-700">Beneficiaries</span>
                    <button onClick={addBeneficiary} className="text-sm font-medium text-zinc-950 underline underline-offset-4">
                      Add heir
                    </button>
                  </div>
                  {beneficiaries.map((beneficiary, index) => (
                    <div key={index} className="grid gap-3 md:grid-cols-[1fr_120px_42px]">
                      <input
                        value={beneficiary.wallet}
                        onChange={(event) => updateBeneficiary(index, "wallet", event.target.value)}
                        placeholder="0x beneficiary wallet"
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={beneficiary.share}
                        onChange={(event) => updateBeneficiary(index, "share", event.target.value)}
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                      />
                      <button
                        onClick={() => removeBeneficiary(index)}
                        disabled={beneficiaries.length === 1}
                        className="flex h-12 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-40"
                        title="Remove beneficiary"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <p className={`text-sm ${Math.round(shareTotal * 100) === 10000 ? "text-emerald-600" : "text-amber-600"}`}>
                    Distribution total: {shareTotal}%
                  </p>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Secret recovery package</span>
                  <textarea
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    rows={8}
                    className="w-full resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-4 text-sm leading-6 outline-none transition focus:border-zinc-500"
                  />
                </label>

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
                <VaultList
                  emptyText="No beneficiary vaults found for this wallet."
                  title="Assigned vaults"
                  vaults={beneficiaryVaults}
                  account={account}
                  decrypted={decrypted}
                  onAction={writeVaultAction}
                  onDecrypt={decryptVault}
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
    <div className="rounded-[24px] border border-zinc-200 bg-white p-4">
      <Icon className="mb-5 h-5 w-5 text-zinc-500" />
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
}: {
  title: string
  emptyText: string
  vaults: VaultRecord[]
  account?: Address
  decrypted: Record<string, DecryptedVault>
  onAction: (
    vaultId: bigint,
    functionName: "checkIn" | "startRecovery" | "triggerEmergency" | "cancelRecovery" | "unlockVault" | "grantUnlockedAccess",
  ) => void
  onDecrypt: (vault: VaultRecord) => void
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
}: {
  vault: VaultRecord
  account?: Address
  decrypted?: DecryptedVault
  onAction: (
    vaultId: bigint,
    functionName: "checkIn" | "startRecovery" | "triggerEmergency" | "cancelRecovery" | "unlockVault" | "grantUnlockedAccess",
  ) => void
  onDecrypt: (vault: VaultRecord) => void
}) {
  const status = statusFor(vault)
  const StatusIcon = status.icon
  const isOwner = account && vault.owner.toLowerCase() === account.toLowerCase()
  const isBeneficiary =
    account && vault.beneficiaries.some((beneficiary) => beneficiary.wallet.toLowerCase() === account.toLowerCase())
  const canDecrypt = Boolean(isOwner || (isBeneficiary && vault.unlocked))

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

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <VaultFact icon={HeartPulse} label="Last check-in" value={dateText(vault.lastCheckIn)} />
        <VaultFact icon={Timer} label="Inactivity" value={secondsToText(vault.inactivityPeriod)} />
        <VaultFact icon={Shield} label="Grace" value={secondsToText(vault.gracePeriod)} />
        <VaultFact icon={Users} label="Heirs" value={String(vault.beneficiaryCount)} />
      </div>

      <div className="mt-5 rounded-[20px] bg-white p-4">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Distribution</p>
        <div className="space-y-2">
          {vault.beneficiaries.map((beneficiary) => (
            <div key={beneficiary.wallet} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-mono text-xs text-zinc-600">{shortAddress(beneficiary.wallet)}</span>
              <span className="font-medium">{beneficiary.shareBps / 100}%</span>
            </div>
          ))}
        </div>
      </div>

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
        {isBeneficiary && !vault.unlocked && vault.unlockReady && (
          <ActionButton icon={Unlock} label="Unlock" onClick={() => onAction(vault.id, "unlockVault")} />
        )}
        {canDecrypt && (
          <ActionButton icon={FileText} label="Decrypt" onClick={() => onDecrypt(vault)} primary={vault.unlocked} />
        )}
      </div>

      {vault.triggerStartedAt > 0n && (
        <p className="mt-4 text-sm text-zinc-600">
          Recovery started at {dateText(vault.triggerStartedAt)}. Unlock ready after{" "}
          {dateText(vault.triggerStartedAt + vault.gracePeriod)}.
        </p>
      )}

      {decrypted && (
        <div className="mt-5 rounded-[22px] border border-emerald-100 bg-emerald-50 p-4">
          <div className="mb-3 grid gap-2 text-sm md:grid-cols-3">
            <span>Release code: {decrypted.releaseCode}</span>
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

function Roadmap() {
  const items = [
    ["Done", "CoFHE contract", "Encrypted release code, private asset count, hidden primary beneficiary, ACL unlock."],
    ["Done", "End-to-end dApp", "Wallet connect, create vault, check in, emergency trigger, beneficiary unlock, decrypt."],
    ["Done", "On-chain storage", "Recovery package ciphertext, beneficiary splits, timers, and trigger state live in contract state."],
    ["Next", "Notification relays", "Email, Telegram, and wallet push alerts for check-ins and grace-period warnings."],
    ["Next", "IPFS/Lighthouse mode", "Optional large file storage while preserving on-chain payload hashes and access control."],
    ["Next", "Multi-sig recovery", "Require 2-of-N heirs, counsel, or DAO trustee before final unlock."],
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

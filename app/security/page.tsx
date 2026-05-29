import Link from "next/link"

const checks = [
  "Recovery payloads are encrypted in the browser before they are written on-chain.",
  "CoFHE handles gate release secret, private asset count, and primary beneficiary reads through ACL permissions.",
  "Owners can check in, cancel recovery, rotate beneficiaries, and update metadata before unlock.",
  "Beneficiaries can decrypt only after the vault unlocks and access is granted on-chain.",
]

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-medium underline underline-offset-4">
          Back to SilentVault
        </Link>
        <h1 className="mt-10 font-serif text-5xl font-normal">Security</h1>
        <p className="mt-6 text-base leading-7 text-muted-foreground">
          SilentVault is designed so recovery material stays encrypted until the configured on-chain recovery policy is
          satisfied. Use testnet vaults for demos and audits before relying on the protocol for mainnet assets.
        </p>
        <div className="mt-10 space-y-3">
          {checks.map((check) => (
            <div key={check} className="rounded-2xl border border-border bg-card p-4 text-sm leading-6">
              {check}
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm leading-6 text-muted-foreground">
          Report security issues to security@silentvault.app. Do not send seed phrases, private keys, or plaintext
          recovery instructions by email.
        </p>
      </div>
    </main>
  )
}

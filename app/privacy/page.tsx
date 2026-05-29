import Link from "next/link"

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-medium underline underline-offset-4">
          Back to SilentVault
        </Link>
        <h1 className="mt-10 font-serif text-5xl font-normal">Privacy</h1>
        <div className="mt-8 space-y-5 text-sm leading-7 text-muted-foreground">
          <p>
            SilentVault encrypts recovery instructions locally in the browser before submitting contract transactions.
            Public chain data can still reveal wallet addresses, vault timing, shares, event history, and metadata hashes.
          </p>
          <p>
            Optional notification details are included in the encrypted recovery package and represented on-chain only by
            a hash. Server-side relays require explicit operator configuration.
          </p>
          <p>
            The hosted app uses Vercel Analytics for aggregate product telemetry. Do not enter plaintext seed phrases
            unless the vault is intentionally being used as the final sealed recovery location.
          </p>
        </div>
      </div>
    </main>
  )
}

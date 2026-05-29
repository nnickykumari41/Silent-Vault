import Link from "next/link"

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-medium underline underline-offset-4">
          Back to SilentVault
        </Link>
        <h1 className="mt-10 font-serif text-5xl font-normal">Terms</h1>
        <div className="mt-8 space-y-5 text-sm leading-7 text-muted-foreground">
          <p>
            SilentVault is an experimental testnet application for encrypted recovery workflows. It is not legal,
            financial, tax, or custody advice.
          </p>
          <p>
            Users are responsible for wallet security, beneficiary selection, private key custody, and verifying any
            contract address before signing transactions.
          </p>
          <p>
            Mainnet use should wait for CoFHE mainnet support, independent contract audit, production monitoring, and
            legal review for the intended jurisdiction.
          </p>
        </div>
      </div>
    </main>
  )
}

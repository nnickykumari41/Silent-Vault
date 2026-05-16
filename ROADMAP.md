# SilentVault Roadmap

## Finished MVP

- On-chain SilentVault contract
- CoFHE encrypted release code
- CoFHE encrypted private asset count
- CoFHE encrypted primary beneficiary
- Encrypted recovery package stored on-chain as ciphertext
- Beneficiary wallets and share distribution
- Owner heartbeat check-in
- Inactivity recovery trigger
- Grace-period cancellation
- Emergency panic mode
- Beneficiary unlock and ACL grant
- Local browser decryption after authorized unlock
- Sepolia deployment
- Landing page, dashboard, create flow, beneficiary flow, and roadmap view
- Clean Vercel alias: `silentvault-recovery.vercel.app`
- Removed leftover property-template cards and stale phone mockup dependency
- Simplified hero and dashboard copy for the SilentVault flow

## Production Hardening

- Independent contract audit
- Formal threat model for beneficiary collusion, false triggers, compromised owner wallet, and lost beneficiary wallet
- Optional multisig unlock policy
- Larger encrypted file mode with Lighthouse/IPFS plus on-chain content hashes
- Email, Telegram, and wallet notifications for missed check-ins and grace periods
- Rotation flow for beneficiary wallets
- Owner recovery phrase export guidance and legal disclaimers
- Event indexer for faster dashboard loading
- Multi-chain deployment matrix for CoFHE-supported testnets/mainnets
- Contract metadata panel inside the dashboard with network, contract address, and explorer link
- Full wallet browser E2E tests for create, check-in, recovery, unlock, and decrypt

## Business Expansion

- Premium family vault plans
- Family office dashboard
- DAO treasury succession plans
- Legal trustee and counsel workflows
- AI-assisted proof-of-life checks as an opt-in risk signal

# SilentVault Roadmap

## Finished MVP

- On-chain SilentVault contract
- CoFHE encrypted high-entropy release secret
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
- Wave 5 production contract extensions:
  - Optional M-of-N recovery approvals
  - Owner beneficiary rotation
  - Hidden beneficiary commitments with claim-salt reveal and unrevealed commitment rotation
  - External Lighthouse/IPFS CID and file-hash anchors
  - Notification and proof-of-life metadata hashes
- Browser event timeline and event indexer script
- Guarded email, Telegram, and webhook notification relay endpoint
- Recovery package templates and seed-phrase safety UX
- Deployment runbook, threat model, audit checklist, and GitHub CI

## Production Hardening

- Independent contract audit
- Third-party review of the Wave 5 state machine
- Production notification workers for scheduled missed-check-in and grace-period alerts
- Production monitoring for failed CoFHE decrypt requests and RPC degradation
- Mainnet deployment once CoFHE mainnet support is available
- Full wallet browser E2E tests for create, check-in, recovery, unlock, and decrypt

## Business Expansion

- Premium family vault plans
- Family office dashboard
- DAO treasury succession plans
- Legal trustee and counsel workflows
- AI-assisted proof-of-life checks as an opt-in risk signal

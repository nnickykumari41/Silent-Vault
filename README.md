# SilentVault

SilentVault is a privacy-preserving crypto inheritance and emergency recovery app. It lets a wallet owner create an encrypted recovery vault that stays private until on-chain conditions are met, such as inactivity, a missed check-in window, or a manual emergency trigger.

The main idea is simple: your recovery instructions, private asset notes, release secret, and beneficiary metadata should not be visible before the right moment. SilentVault uses CoFHE/Fhenix encrypted handles and on-chain access control so beneficiaries can only decrypt after the vault is unlocked.

Live app: https://silentvault-recovery.vercel.app

 alias: `silentvault-recovery.vercel.app`

Sepolia contract: `0xa472cF48636bDB9C5B0cBA550eA368d71f7C35cD`

Explorer: https://sepolia.etherscan.io/address/0xa472cF48636bDB9C5B0cBA550eA368d71f7C35cD

Sourcify verification: https://repo.sourcify.dev/contracts/full_match/11155111/0xa472cF48636bDB9C5B0cBA550eA368d71f7C35cD/

## What The App Does

- Creates private recovery vaults for self-custody crypto users.
- Stores vault policy, timers, beneficiary shares, encrypted payload references, and encrypted release metadata on-chain.
- Keeps the recovery package encrypted before unlock.
- Lets the owner check in to keep the vault locked.
- Lets an authorized beneficiary start recovery after the inactivity period.
- Gives the owner a grace period to cancel a false trigger.
- Lets the owner trigger emergency mode manually.
- Unlocks the vault on-chain when the correct recovery condition is met.
- Grants CoFHE access to beneficiaries only after unlock.
- Lets authorized beneficiaries decrypt the recovery package locally in the browser.

## Why It Matters

Crypto self-custody has a real inheritance problem. If an owner dies, disappears, loses access, or cannot communicate, funds and instructions can be lost forever. Traditional solutions often require exposing seed phrases, trusting a centralized custodian, or relying on slow legal processes.

SilentVault is built around controlled private access. Nobody, including the contract, should read the recovery secret before the unlock conditions are satisfied.

## How It Works

1. The owner connects a Sepolia wallet.
2. The owner creates a vault with beneficiaries, share percentages, inactivity timing, grace timing, and private recovery instructions.
3. The frontend encrypts sensitive values with the CoFHE client before sending the transaction.
4. The smart contract stores the encrypted handles, ciphertext payload, payload hash, beneficiaries, and timer policy.
5. The owner can check in at any time to reset the inactivity clock.
6. If the owner becomes inactive, a beneficiary can start recovery.
7. During the grace period, the owner can cancel recovery.
8. If the grace period passes, the vault can be unlocked.
9. After unlock, the contract grants beneficiary ACL access to the encrypted handles.
10. The beneficiary decrypts the recovery package locally.

## Current Build Status

This project is deployed and working on Ethereum Sepolia.

Implemented:

- Landing page with preserved template animation style.
- Separate dashboard pages:
  - `/dashboard`
  - `/dashboard/create`
  - `/dashboard/beneficiary`
  - `/dashboard/roadmap`
- Wallet connection through an injected browser wallet.
- CoFHE client initialization.
- Vault creation with encrypted high-entropy release secret, encrypted asset count, encrypted primary beneficiary, and encrypted recovery note.
- Multi-beneficiary shares, up to 8 beneficiaries.
- Owner check-in.
- Beneficiary recovery start.
- Grace-period unlock.
- Owner emergency trigger.
- Owner recovery cancellation.
- Optional M-of-N recovery approvals before beneficiary unlock.
- Owner beneficiary rotation before release.
- Hidden beneficiary commitments with claim-salt reveal and unrevealed commitment rotation.
- External Lighthouse/IPFS CID and file-hash anchoring.
- Notification relay hashes plus guarded email, Telegram, and webhook API route.
- Browser event timeline and Hardhat event indexer script.
- Proof-of-life plan hash anchoring.
- Recovery package templates for wallet inventory, exchanges, legal contacts, and final instructions.
- Post-unlock beneficiary access grant.
- Local browser decryption after unlock.
- Hardhat tests for the core contract flow.
- Sepolia smoke script that creates, unlocks, and decrypts a real test vault.
-  deployment on Vercel with the clean public alias `silentvault-recovery.vercel.app`.
- Cleaned landing page that preserves the template hero animation while removing the old phone mockup dependency.
- Removed unused property/demo carousel sections from the homepage.
- Simplified dashboard intro copy and wallet status area.

## Latest Frontend Update

The frontend was cleaned up so it feels like a SilentVault product instead of a renamed template.

- Hero copy now focuses on the core promise: encrypted recovery for crypto that should not disappear with the owner.
- The phone image reference was removed because the image asset is no longer part of the app.
- The homepage no longer renders the old property-style demo cards from the starter template.
- Header and footer links now point to the active `#protocol` section.
- Dashboard copy now starts with `Create, check in, unlock.` and avoids noisy zero-state counters before wallet connection.
- The previous generated Vercel alias was removed. Use `https://silentvault-recovery.vercel.app`.

## Project Structure

```txt
TIMELOCK/
  PROEJCT.MD              Original product brief
  README.md               Root project handoff
  frontend/               Next.js app, contracts, scripts, tests
    app/                  App routes
    components/           Landing and dApp UI
    contracts/            SilentVault Solidity contract
    lib/                  Contract config and crypto helpers
    scripts/              Deploy and Sepolia smoke scripts
    test/                 Hardhat contract tests
    deployments/          Deployment metadata
```

## Local Setup

```bash
cd frontend
npm install
npm run compile
npm run test:contracts
npm run lint
npm run build
npm run dev
```

Local app URL:

```txt
http://localhost:3000
```

Required frontend environment:

```bash
NEXT_PUBLIC_SILENT_VAULT_ADDRESS=0xa472cF48636bDB9C5B0cBA550eA368d71f7C35cD
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

Use `PRIVATE_KEY` only in the shell for deploy or smoke scripts. Do not commit private keys and do not expose them to the hosted frontend.

## Sepolia Smoke Test

```bash
cd frontend
$env:PRIVATE_KEY="..."
$env:SEPOLIA_RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
npm run smoke:sepolia
```

The smoke test creates a real vault on Sepolia, starts recovery, unlocks it, grants access, and decrypts the CoFHE handles.

## Wave 5 -   Readiness

Wave 5 turns SilentVault from an MVP into a fuller   candidate.

- Multi-sign recovery: vault creators can require M-of-N beneficiary approvals before non-emergency unlock.
- Beneficiary rotation: owners can replace unreleased beneficiary wallets; pending approvals are reset.
- Hidden beneficiaries: owners can create salted commitment slots. Beneficiaries reveal only when they submit their claim salt.
- Larger private files: the create flow anchors an encrypted file CID and SHA-256 hash while keeping large documents off-chain.
- Notification relays: the vault stores a private notification config hash, and `/api/notifications` can relay email, Telegram, and webhook alerts when server credentials are configured.
- Event indexer: the dashboard indexes contract events into browser cache, and `npm run index:events` can produce a deployment event cache.
- Proof-of-life options: a proof-of-life plan hash is anchored with the vault metadata.
- Legal and safety UX: the create flow includes recovery package templates and safer seed-phrase handling guidance.
- Mainnet readiness: `DEPLOYMENT.md` documents the CoFHE-supported deployment matrix and preview env setup.
- Security readiness: `SECURITY.md` documents the threat model and audit checklist.
- CI/CD: `.github/workflows/ci.yml` runs compile, contract tests, lint, and build, with a manual Sepolia smoke-test job.

##  Direction

SilentVault can grow from a crypto inheritance dApp into a private digital legacy protocol. The long-term version could support family vaults, legal trustee workflows, DAO treasury succession, business continuity plans, private asset inventories, and encrypted personal messages that only unlock under well-defined conditions.

The winning narrative stays the same: not death, but controlled private access.

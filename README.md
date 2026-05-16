# SilentVault

SilentVault is a privacy-preserving crypto inheritance and emergency recovery app. It lets a wallet owner create an encrypted recovery vault that stays private until on-chain conditions are met, such as inactivity, a missed check-in window, or a manual emergency trigger.

The main idea is simple: your recovery instructions, private asset notes, release code, and beneficiary metadata should not be visible before the right moment. SilentVault uses CoFHE/Fhenix encrypted handles and on-chain access control so beneficiaries can only decrypt after the vault is unlocked.

Live app: https://silentvault-recovery.vercel.app

Production alias: `silentvault-recovery.vercel.app`

Sepolia contract: `0x899dE425976B0618a77D9Fd1195d33442955BeFF`

Explorer: https://sepolia.etherscan.io/address/0x899dE425976B0618a77D9Fd1195d33442955BeFF

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
- Vault creation with encrypted release code, encrypted asset count, encrypted primary beneficiary, and encrypted recovery note.
- Multi-beneficiary shares, up to 8 beneficiaries.
- Owner check-in.
- Beneficiary recovery start.
- Grace-period unlock.
- Owner emergency trigger.
- Owner recovery cancellation.
- Post-unlock beneficiary access grant.
- Local browser decryption after unlock.
- Hardhat tests for the core contract flow.
- Sepolia smoke script that creates, unlocks, and decrypts a real test vault.
- Production deployment on Vercel with the clean public alias `silentvault-recovery.vercel.app`.
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
NEXT_PUBLIC_SILENT_VAULT_ADDRESS=0x899dE425976B0618a77D9Fd1195d33442955BeFF
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

## Wave 5 - Missing Features And Next Build

These are the main issues and missing features found after reviewing the current app, contract, and deployment state.

- Notification relays: add email, Telegram, and wallet push alerts for missed check-ins, recovery start, grace-period warnings, and successful unlocks.
- Event indexer: add an indexer or lightweight backend cache for vault events so dashboards do not depend only on direct RPC reads.
- Beneficiary rotation: add an owner flow to replace a beneficiary wallet if an heir loses access or changes wallet.
- Multi-sign recovery: support optional 2-of-N beneficiary, lawyer, trustee, or DAO approval before unlock.
- Hidden beneficiaries: current beneficiary wallet list is public on-chain; add a stronger private-beneficiary mode where identities stay hidden until unlock.
- Larger private files: integrate Lighthouse/IPFS or another encrypted storage layer for PDFs, legal docs, images, videos, and long recovery instructions, with hashes anchored on-chain.
- Proof-of-life options: add optional wallet-activity checks, scheduled check-in reminders, and risk signals beyond manual check-in.
- Legal and safety UX: add inheritance disclaimers, recovery phrase handling guidance, estate-planning notes, and safer copy around seed phrases.
- Independent audit: run a third-party smart-contract audit and write a formal threat model covering false triggers, compromised owner wallet, beneficiary collusion, and lost beneficiary wallet.
- Mainnet readiness: add a clear deployment matrix for CoFHE-supported chains, production RPC providers, monitoring, and contract verification.
- Dependency hardening: track the remaining npm audit warnings from Hardhat/tooling dependencies and the latest Next.js bundled PostCSS advisory; migrate when upstream packages make safe upgrades available.
- CI/CD: add GitHub-based lint, build, contract test, and smoke-test workflows before production deployments.
- Preview environments: configure Vercel Preview env vars once the project is connected to a git branch.
- Better wallet QA: add scripted browser-wallet E2E tests for create, check-in, start recovery, unlock, and decrypt flows.
- Contract metadata in UI: show the active network, contract address, and explorer link inside the dashboard for easier user verification.
- Recovery package templates: add guided templates for wallet inventory, exchange accounts, hardware-wallet location, legal contacts, and final instructions.
- Account abstraction option: explore gas sponsorship or session keys for beneficiaries who may not have Sepolia/mainnet gas during recovery.

## Product Direction

SilentVault can grow from a crypto inheritance dApp into a private digital legacy protocol. The long-term version could support family vaults, legal trustee workflows, DAO treasury succession, business continuity plans, private asset inventories, and encrypted personal messages that only unlock under well-defined conditions.

The winning narrative stays the same: not death, but controlled private access.

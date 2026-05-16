# SilentVault

Private inheritance and emergency recovery for self-custody crypto.

SilentVault is a CoFHE-powered dead-man-switch dApp. It stores recovery package ciphertext, beneficiary policy, inactivity timers, grace-period state, and encrypted release metadata on-chain. Plaintext recovery instructions never enter the contract.

## Deployed Contract

- Network: Ethereum Sepolia
- Contract: `0x899dE425976B0618a77D9Fd1195d33442955BeFF`
- Explorer: https://sepolia.etherscan.io/address/0x899dE425976B0618a77D9Fd1195d33442955BeFF

## What Works End To End

- Wallet connect through an injected browser wallet
- CoFHE client initialization and self permit creation
- Create vault with encrypted release code, encrypted asset count, encrypted primary beneficiary, and encrypted recovery note
- Multi-beneficiary distribution shares, up to 8 heirs
- Owner check-in to keep the vault locked
- Owner emergency trigger
- Beneficiary inactivity recovery start
- Grace-period unlock
- Post-unlock CoFHE ACL grants to beneficiaries
- Local-only decryption of the recovery package after authorized unlock
- Contract tests covering encrypted create, early decrypt denial, unlock, timers, check-in, cancel, and emergency mode

## Local Setup

```bash
npm install
npm run compile
npm run test:contracts
npm run lint
npm run build
npm run dev
```

Open http://localhost:3000 and use the separate app pages:

- `/dashboard`
- `/dashboard/create`
- `/dashboard/beneficiary`
- `/dashboard/roadmap`

The app reads public dApp config from `.env.local`:

```bash
NEXT_PUBLIC_SILENT_VAULT_ADDRESS=0x899dE425976B0618a77D9Fd1195d33442955BeFF
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

Do not commit private keys. Use `PRIVATE_KEY` only in the shell when deploying.

## Sepolia Smoke Test

After setting `PRIVATE_KEY`, `NEXT_PUBLIC_SILENT_VAULT_ADDRESS`, and `SEPOLIA_RPC_URL`, run:

```bash
npm run smoke:sepolia
```

The smoke test creates a real Sepolia vault, starts recovery, unlocks it, and decrypts the CoFHE handles.

## Demo Flow

1. Connect wallet on Sepolia.
2. Open `/dashboard`.
3. Create a vault with the `Demo: immediate` preset.
4. Switch to the beneficiary wallet.
5. Load assigned vaults.
6. Start recovery.
7. Unlock the vault.
8. Decrypt the recovery package.

## CoFHE References

- Client SDK overview: https://cofhe-docs.fhenix.zone/client-sdk/introduction/overview
- Writing encrypted data: https://cofhe-docs.fhenix.zone/client-sdk/guides/writing-encrypted-data
- FHE.sol overview: https://cofhe-docs.fhenix.zone/fhe-library/reference/fhe-sol/overview




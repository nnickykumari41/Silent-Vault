# SilentVault Deployment Runbook

## Supported CoFHE Networks

| Network | Chain ID | Hardhat network | CoFHE status | Explorer |
| --- | ---: | --- | --- | --- |
| Ethereum Sepolia | 11155111 | `eth-sepolia` | Supported testnet | https://sepolia.etherscan.io |
| Arbitrum Sepolia | 421614 | `arb-sepolia` | Supported testnet | https://sepolia.arbiscan.io |
| Base Sepolia | 84532 | `base-sepolia` | Supported testnet | https://sepolia.basescan.org |

Mainnet deployment should wait for CoFHE mainnet support, production RPC SLAs, monitoring, and an independent audit.

## Required Environment

```bash
NEXT_PUBLIC_SILENT_VAULT_ADDRESS=
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

PRIVATE_KEY=
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

SILENTVAULT_NOTIFICATION_SECRET=
RESEND_API_KEY=
RESEND_FROM=SilentVault <alerts@example.com>
TELEGRAM_BOT_TOKEN=
SILENTVAULT_ALLOWED_WEBHOOK_HOSTS=
```

## Commands

```bash
npm ci
npm run compile
npm run test:contracts
npm run lint
npm run build
```

Deploy Sepolia:

```bash
$env:PRIVATE_KEY="..."
$env:SEPOLIA_RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
npm run deploy:sepolia
```

Smoke test Sepolia:

```bash
$env:PRIVATE_KEY="..."
$env:NEXT_PUBLIC_SILENT_VAULT_ADDRESS="0x..."
npm run smoke:sepolia
```

Index event cache:

```bash
$env:NEXT_PUBLIC_SILENT_VAULT_ADDRESS="0x..."
npm run index:events
```

## Vercel Preview Checklist

- Set `NEXT_PUBLIC_SILENT_VAULT_ADDRESS`, `NEXT_PUBLIC_CHAIN_ID`, and `NEXT_PUBLIC_RPC_URL` for Preview and Production.
- Set notification relay secrets only in server-side Vercel env vars.
- Keep deployer private keys out of Vercel frontend env vars.
- Run the GitHub CI workflow before aliasing production.

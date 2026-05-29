# SilentVault Security Model

## Scope

SilentVault protects recovery instructions and release metadata until the vault is unlocked by an on-chain policy. The contract stores encrypted CoFHE handles, ciphertext payloads, beneficiary policy, approval state, file hashes, and metadata hashes. Plaintext recovery material is only handled in the connected browser after CoFHE access is granted.

## Trust Boundaries

- CoFHE encrypted handles: high-entropy release secret, private asset count, and primary beneficiary are encrypted client-side and controlled by `FHE.allow`.
- Browser payload encryption: the long recovery package is encrypted with Web Crypto before it is submitted.
- On-chain policy: inactivity, grace period, emergency mode, beneficiary rotation, hidden beneficiary reveal, and M-of-N approvals are enforced by the contract.
- Notification relay: email, Telegram, and webhook delivery require a server secret and provider API keys. The contract stores only notification hashes.
- Webhook relay: server-side webhooks are disabled unless `SILENTVAULT_ALLOWED_WEBHOOK_HOSTS` allow-lists the destination domain. Resolved loopback, private, link-local, and multicast IPs are rejected.
- External files: large files should be encrypted before upload to Lighthouse/IPFS. The contract anchors the CID plus file hash, not the file plaintext.

## Main Threats

- False recovery trigger: owner can cancel during grace; beneficiaries need the configured approval threshold before non-emergency unlock.
- Beneficiary collusion: use higher approval thresholds for legal/trustee flows; emergency owner unlock bypasses threshold only for the owner wallet.
- Lost beneficiary wallet: owner can rotate unreleased beneficiary wallets and unrevealed hidden commitments. Rotation resets pending approvals.
- Hidden beneficiary discovery: private slots use salted commitments and reveal only when the claimant submits the salt.
- Compromised owner wallet: an attacker can emergency-trigger or rotate before unlock. Use hardware wallets and monitoring for production.
- Seed phrase exposure: avoid storing raw seed phrases unless this vault is the intended final sealed recovery location.

## Audit Checklist

- Review all state transitions around `startRecovery`, `approveRecovery`, `cancelRecovery`, `checkIn`, `unlockVault`, and `triggerEmergency`.
- Confirm hidden commitment salts are high entropy and shared off-chain only with intended beneficiaries.
- Verify CoFHE ACL grants happen only after unlock or owner creation access.
- Verify frontend never sends plaintext recovery data to the notification relay.
- Run `npm run compile`, `npm run test:contracts`, `npm run lint`, `npm run build`, and a Sepolia smoke test before production deployments.

## Dependency Notes

`npm audit fix` has been applied for non-breaking updates, and overrides pin patched transitive versions where they do not break the CoFHE-compatible toolchain. Remaining audit findings are currently in the Hardhat 2 / Ethers 5 tree and Next.js bundled PostCSS. The available automated fixes require breaking Hardhat 3/toolbox or Next downgrade paths, so they should be handled in a dedicated dependency migration after CoFHE plugin compatibility is confirmed.

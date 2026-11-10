# PocketLedger encrypted-vault implementation contract

Status: design gate for the security upgrade. This document does not claim that the live app encrypts IndexedDB records.

## Non-negotiable safety rules

- Keep the current production database readable until a complete migration has been tested against representative fixtures and browser integration tests.
- Never overwrite or delete the legacy database during preparation.
- Never derive a vault key from the six-digit PIN alone. The PIN and recovery secret are independent key-wrapping credentials for a random 256-bit data-encryption key.
- Never perform WebCrypto awaits while relying on an open IndexedDB transaction. Browsers may auto-commit an idle transaction.
- Never silently downgrade to plaintext if vault metadata is missing, corrupt, or unsupported.
- Keep the draft PR unmerged until every exit criterion below is met.

## Required storage design

Use a repository boundary with asynchronous methods, not a proxy around IDB transactions.

1. **Read path:** open a readonly transaction, collect envelopes and their revision numbers, let the transaction complete, then decrypt outside the transaction. Verify each envelope's store name, primary key, schema version, and authenticated ciphertext before returning domain records.
2. **Write path:** serialize writes through a per-database queue. Read the current record/revision in a short readonly transaction, decrypt and apply the domain mutation outside IDB, encrypt the resulting record, then open a new readwrite transaction. Re-check the expected revision inside that transaction before putting. On conflict, abort and retry the complete operation from a fresh read.
3. **Multi-store writes:** pre-read all participating records, compute and encrypt every new envelope before opening the write transaction. In one readwrite transaction, check all expected revisions and issue all puts/deletes synchronously. If any check fails, abort the whole transaction and retry. Do not split a financial transfer, journal pair, or cascading delete across commits.
4. **Indexes:** encrypted payload fields cannot remain IndexedDB index keys. Replace index-based domain queries with repository reads/decrypt/filter initially. Do not retain amounts, descriptions, dates, account names, or categories in clear metadata merely to preserve indexes. Primary keys remain visible because IndexedDB needs them as keyPath.
5. **Schema:** encrypted envelope stores have keyPath `id`, and contain only `id`, envelope marker/version, random IV, ciphertext, and a monotonic revision. Store-level AAD binds ciphertext to the logical store and record ID.
6. **Audit:** authenticate/decrypt every envelope and report failures read-only. Never auto-delete, overwrite, or "repair" an authentication failure.

## Migration protocol

1. Require the user to create and verify a current encrypted backup using the existing backup format before migration.
2. Create a separate staging database; never mutate the live legacy database in place.
3. Read legacy records, validate domain invariants, encrypt into staging, and record per-store counts.
4. Close/reopen staging and decrypt every staged record; compare canonicalized records and counts with the source snapshot.
5. Commit a migration-complete marker only after full verification. Retain the legacy database as a rollback copy.
6. Switch the app to the encrypted database only after explicit user confirmation. If any stage fails, discard staging only; leave the legacy database untouched.
7. Do not delete the legacy copy automatically. Provide a separately confirmed cleanup step only after the user has verified the encrypted app and a fresh backup.

## Backup and recovery contract

- Existing v1/v2 backups remain importable. A v3 backup exports decrypted domain records into the existing password-encrypted backup container; the vault key itself is never exported.
- Restore validates the entire backup before writing, then performs a single atomic replacement in the encrypted repository. A failed restore leaves the current database unchanged.
- Recovery code is displayed once at vault creation, must be explicitly acknowledged as saved, and is never persisted in plaintext. Recovery unlocks the same random data key and permits re-wrapping it with a new PIN.
- Recovery is not a server reset flow. Losing both PIN and recovery code means the vault cannot be decrypted.

## Passkey / biometric contract

WebAuthn is an authentication ceremony, not automatically a source of encryption key material. Only enable passkey-assisted vault unlock if the browser exposes and passes a tested PRF-based key derivation flow. Otherwise describe it accurately as an additional local authentication gate and retain PIN/recovery-based key unwrap. Do not promise native Face ID, Secure Enclave storage, or universal Safari support.

## Auto-lock and integrity contract

- App backgrounding/page hide locks immediately.
- User-configurable idle timeout options: 1, 5, 10, or 15 minutes; reset only on genuine user activity.
- Locking clears in-memory references to the unlocked key where practical and blocks all repository reads/writes until re-unlocked.
- Integrity audit authenticates all records and checks domain relationships; it is read-only and clearly distinguishes cryptographic failures from domain warnings.

## Exit criteria before merge or deployment

- All seven stores are encrypted at rest in the active app.
- Every direct IndexedDB call in app code is routed through the repository layer; no plaintext write path remains.
- Multi-store financial operations remain atomic under concurrent/retried operations.
- PIN unlock and recovery unlock both decrypt the same vault; changing PIN does not re-encrypt every row.
- v1/v2 backup import, v3 backup export/restore, interrupted migration, rollback, and wrong-key scenarios are covered.
- Playwright verifies encrypted envelopes at rest, successful UI workflows after unlock, lock/re-unlock, offline operation, and migration rollback in an isolated browser context.
- Node unit tests, browser integration tests, syntax checks, static checks, and GitHub Actions all pass.
- Independent review of cryptographic and migration code is complete.
- User explicitly approves the migration after seeing the backup and rollback instructions.

## Current implementation boundary

`vault-crypto.js` currently provides key creation/wrapping, recovery-code normalization, AES-GCM record helpers, and metadata validation. It is not yet connected to IndexedDB reads/writes, backup/restore, migration, recovery UI, passkeys, or configurable lock settings. The existing app therefore remains on its existing local-PIN access barrier and plaintext IndexedDB storage until the full repository and migration work is complete.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function loadVault() {
  const context = { window: {}, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, btoa: value => Buffer.from(value, "binary").toString("base64"), atob: value => Buffer.from(value, "base64").toString("binary"), Date, JSON, String, Error, Promise, Object, Array };
  vm.runInNewContext(fs.readFileSync(require.resolve("../vault-crypto.js"), "utf8"), context);
  return context.window.PocketLedgerVaultCrypto;
}

test("vault key can be unlocked by PIN and recovery code", async () => {
  const vault = loadVault();
  const created = await vault.createVault("246810");
  const byPin = await vault.unlockWithPin(created.metadata, "246810");
  const byRecovery = await vault.unlockWithRecoveryCode(created.metadata, created.recoveryCode);
  const record = { id: "tx_1", amount: 125000, description: "Encrypted test" };
  const encrypted = await vault.encryptRecord(created.masterKey, "transactions", record);
  assert.equal(encrypted.__pocketLedgerEncrypted, true);
  assert.equal(encrypted.amount, undefined);
  assert.equal(JSON.stringify(await vault.decryptRecord(byPin, "transactions", encrypted)), JSON.stringify(record));
  assert.equal(JSON.stringify(await vault.decryptRecord(byRecovery, "transactions", encrypted)), JSON.stringify(record));
});

test("wrong PIN, wrong recovery code, and cross-store substitution are rejected", async () => {
  const vault = loadVault();
  const created = await vault.createVault("135790");
  await assert.rejects(() => vault.unlockWithPin(created.metadata, "000000"));
  await assert.rejects(() => vault.unlockWithRecoveryCode(created.metadata, "not-a-recovery-code"));
  const envelope = await vault.encryptRecord(created.masterKey, "transactions", { id: 7, amount: 42 });
  const unlocked = await vault.unlockWithPin(created.metadata, "135790");
  await assert.rejects(() => vault.decryptRecord(unlocked, "accounts", envelope));
  const tampered = { ...envelope, id: 8 };
  await assert.rejects(() => vault.decryptRecord(unlocked, "transactions", tampered));
});

test("store encryption preserves record identity and round-trips all entries", async () => {
  const vault = loadVault();
  const created = await vault.createVault("112233");
  const rows = [{ id: 1, amount: 100 }, { id: 2, amount: 200 }];
  const encrypted = await vault.encryptStore(created.masterKey, "budgets", rows);
  assert.deepEqual(encrypted.map(x => x.id), [1, 2]);
  assert.equal(JSON.stringify(await vault.decryptStore(created.masterKey, "budgets", encrypted)), JSON.stringify(rows));
});

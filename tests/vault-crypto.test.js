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
  assert.equal(JSON.stringify(encrypted.map(x => x.id)), JSON.stringify([1, 2]));
  assert.equal(JSON.stringify(await vault.decryptStore(created.masterKey, "budgets", encrypted)), JSON.stringify(rows));
});

test("recovery code is high entropy, grouped for transcription, and normalized safely", async () => {
  const vault = loadVault();
  const first = await vault.createVault("123456");
  const second = await vault.createVault("123456");
  assert.match(first.recoveryCode, /^(?:[0-9a-f]{4}-){15}[0-9a-f]{4}$/);
  assert.notEqual(first.recoveryCode, second.recoveryCode);
  const unlocked = await vault.unlockWithRecoveryCode(first.metadata, first.recoveryCode.toUpperCase().replaceAll("-", " "));
  const envelope = await vault.encryptRecord(first.masterKey, "savingsGoals", { id: "goal-1", target: 900000 });
  assert.equal(JSON.stringify(await vault.decryptRecord(unlocked, "savingsGoals", envelope)), JSON.stringify({ id: "goal-1", target: 900000 }));
});

test("ciphertext tampering and malformed vault metadata fail closed", async () => {
  const vault = loadVault();
  const created = await vault.createVault("654321");
  const unlocked = await vault.unlockWithPin(created.metadata, "654321");
  const envelope = await vault.encryptRecord(created.masterKey, "transactions", { id: "tx-2", amount: 75000 });
  const ciphertext = envelope.ciphertext.split("");
  ciphertext[Math.floor(ciphertext.length / 2)] = ciphertext[Math.floor(ciphertext.length / 2)] === "A" ? "B" : "A";
  await assert.rejects(() => vault.decryptRecord(unlocked, "transactions", { ...envelope, ciphertext: ciphertext.join("") }));
  await assert.rejects(() => vault.unlockWithPin({ ...created.metadata, version: 99 }, "654321"));
  await assert.rejects(() => vault.unlockWithRecoveryCode(created.metadata, "g".repeat(64)));
});

test("record ciphertext is randomized even for identical records", async () => {
  const vault = loadVault();
  const created = await vault.createVault("987654");
  const record = { id: "same-id", amount: 5000 };
  const one = await vault.encryptRecord(created.masterKey, "transactions", record);
  const two = await vault.encryptRecord(created.masterKey, "transactions", record);
  assert.notEqual(one.iv, two.iv);
  assert.notEqual(one.ciphertext, two.ciphertext);
});

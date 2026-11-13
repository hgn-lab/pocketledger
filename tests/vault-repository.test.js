const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const repository = fs.readFileSync(require.resolve("../vault-repository.js"), "utf8");
const html = fs.readFileSync(require.resolve("../index.html"), "utf8");
const serviceWorker = fs.readFileSync(require.resolve("../service-worker.js"), "utf8");

test("encrypted repository declares all seven financial stores", () => {
  for (const store of ["transactions", "budgets", "accounts", "journalEntries", "transfers", "savingsGoals", "monthlySnapshots"]) {
    assert.ok(repository.includes('"'+store+'"'), "missing encrypted store: " + store);
  }
});

test("repository exposes locked reads, writes, recovery, and integrity audit", () => {
  for (const api of ["create", "unlockWithPin", "unlockWithRecoveryCode", "readAll", "put", "remove", "batch", "audit", "lock"]) {
    assert.ok(repository.includes(api), "missing repository API: " + api);
  }
  assert.match(repository, /requireUnlocked\(\)/);
  assert.match(repository, /decryptStore\(masterKey, storeName, envelopes\)/);
});

test("app loads encrypted repository after cryptographic primitives", () => {
  const cryptoIndex = html.indexOf('<script src="vault-crypto.js"></script>');
  const repositoryIndex = html.indexOf('<script src="vault-repository.js"></script>');
  const appIndex = html.indexOf('<script src="app.js"></script>');
  assert.ok(cryptoIndex >= 0 && repositoryIndex > cryptoIndex && appIndex > repositoryIndex);
  assert.ok(serviceWorker.includes('"./vault-repository.js"'));
});

test("encrypted repository envelope writes are prepared before opening write transaction", () => {
  const cryptoPosition = repository.indexOf("await cryptoApi().encryptRecord");
  const transactionPosition = repository.indexOf('database.transaction(names, "readwrite")');
  assert.ok(cryptoPosition >= 0 && transactionPosition > cryptoPosition);
});

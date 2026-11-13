(() => {
  "use strict";

  const DB_NAME = "PocketLedgerEncryptedDB";
  const DB_VERSION = 1;
  const STORES = Object.freeze([
    "transactions", "budgets", "accounts", "journalEntries",
    "transfers", "savingsGoals", "monthlySnapshots"
  ]);
  const META = "vaultMeta";
  let database = null;
  let masterKey = null;
  let writeQueue = Promise.resolve();

  const cryptoApi = () => {
    const api = window.PocketLedgerVaultCrypto;
    if (!api) throw new Error("Vault cryptography module is unavailable.");
    return api;
  };
  const requireUnlocked = () => {
    if (!database || !masterKey) throw new Error("PocketLedger vault is locked.");
  };
  const requestValue = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
  const transactionDone = tx => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("Database transaction aborted."));
    tx.onerror = () => reject(tx.error || new Error("Database transaction failed."));
  });

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open encrypted database."));
      request.onblocked = () => reject(new Error("Encrypted database upgrade is blocked by another tab."));
    });
  }

  async function readMeta(db) {
    const tx = db.transaction(META, "readonly");
    const done = transactionDone(tx);
    const value = await requestValue(tx.objectStore(META).get("vault"));
    await done;
    return value || null;
  }

  async function persistMeta(db, metadata) {
    const tx = db.transaction(META, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(META).put({ id: "vault", metadata });
    await done;
  }

  async function create(pin) {
    if (database) throw new Error("Vault repository is already initialized.");
    const db = await openDatabase();
    const existing = await readMeta(db);
    if (existing) { db.close(); throw new Error("An encrypted vault already exists."); }
    const created = await cryptoApi().createVault(pin);
    try {
      await persistMeta(db, created.metadata);
      database = db;
      masterKey = created.masterKey;
      return { recoveryCode: created.recoveryCode };
    } catch (error) {
      db.close();
      throw error;
    }
  }

  async function unlockWithPin(pin) {
    const db = database || await openDatabase();
    const record = await readMeta(db);
    if (!record) { db.close(); throw new Error("No encrypted vault has been created."); }
    try {
      const key = await cryptoApi().unlockWithPin(record.metadata, pin);
      database = db;
      masterKey = key;
      return true;
    } catch (error) {
      db.close();
      throw new Error("PIN is incorrect or vault metadata is damaged.");
    }
  }

  async function unlockWithRecoveryCode(code, newPin) {
    if (!/^\\d{6}$/.test(String(newPin || ""))) throw new Error("A new six-digit PIN is required.");
    const db = database || await openDatabase();
    const record = await readMeta(db);
    if (!record) { db.close(); throw new Error("No encrypted vault has been created."); }
    try {
      const api = cryptoApi();
      const key = await api.unlockWithRecoveryCode(record.metadata, code);
      const replacement = await api.rewrapWithPin(record.metadata, key, newPin);
      await persistMeta(db, replacement);
      database = db;
      masterKey = key;
      return true;
    } catch (error) {
      db.close();
      throw new Error("Recovery failed. Check the recovery code and try again.");
    }
  }

  async function readAll(storeName) {
    requireUnlocked();
    if (!STORES.includes(storeName)) throw new Error("Unknown financial store.");
    const tx = database.transaction(storeName, "readonly");
    const done = transactionDone(tx);
    const envelopes = await requestValue(tx.objectStore(storeName).getAll());
    await done;
    return cryptoApi().decryptStore(masterKey, storeName, envelopes);
  }

  async function read(storeName, id) {
    const rows = await readAll(storeName);
    return rows.find(row => String(row.id) === String(id)) || null;
  }

  function enqueueWrite(task) {
    const next = writeQueue.then(task, task);
    writeQueue = next.catch(() => {});
    return next;
  }

  async function batch(changes) {
    requireUnlocked();
    if (!Array.isArray(changes) || !changes.length) return;
    return enqueueWrite(async () => {
      requireUnlocked();
      const names = [...new Set(changes.map(change => change.store))];
      if (names.some(name => !STORES.includes(name))) throw new Error("Unknown financial store.");
      const prepared = [];
      for (const change of changes) {
        if (change.type === "put") {
          const envelope = await cryptoApi().encryptRecord(masterKey, change.store, change.record);
          prepared.push({ ...change, envelope });
        } else if (change.type === "delete") {
          prepared.push(change);
        } else {
          throw new Error("Unsupported repository change.");
        }
      }

      // All writes are synchronous IndexedDB requests in one transaction. The
      // WebCrypto work is deliberately completed before this transaction opens.
      const tx = database.transaction(names, "readwrite");
      const done = transactionDone(tx);
      for (const item of prepared) {
        const store = tx.objectStore(item.store);
        if (item.type === "put") store.put(item.envelope);
        else store.delete(item.id);
      }
      await done;
    });
  }

  const put = (store, record) => batch([{ type: "put", store, record }]);
  const remove = (store, id) => batch([{ type: "delete", store, id }]);

  async function audit() {
    requireUnlocked();
    const report = [];
    for (const store of STORES) {
      try {
        const records = await readAll(store);
        report.push({ store, count: records.length, ok: true });
      } catch (error) {
        report.push({ store, ok: false, error: String(error.message || error) });
      }
    }
    return { ok: report.every(item => item.ok), stores: report, checkedAt: new Date().toISOString() };
  }

  function lock() {
    masterKey = null;
    if (database) database.close();
    database = null;
  }

  async function inspectEncryptedStore(storeName) {
    if (!STORES.includes(storeName)) throw new Error("Unknown financial store.");
    const db = database || await openDatabase();
    const tx = db.transaction(storeName, "readonly");
    const done = transactionDone(tx);
    const rows = await requestValue(tx.objectStore(storeName).getAll());
    await done;
    if (!database) db.close();
    return rows;
  }



  window.PocketLedgerEncryptedRepository = Object.freeze({
    DB_NAME, STORES, create, unlockWithPin, unlockWithRecoveryCode,
    read, readAll, put, remove, batch, audit, lock,
    inspectEncryptedStore
  });
})();
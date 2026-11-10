(() => {
  "use strict";

  const VERSION = 1;
  const KDF = "PBKDF2-SHA-256";
  const ITERATIONS = 600000;
  const CIPHER = "AES-256-GCM";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }
  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }
  async function deriveWrappingKey(secret, salt) {
    const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
      material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }
  async function wrapMasterKey(masterKey, secret, purpose) {
    const salt = randomBytes(16), iv = randomBytes(12);
    const wrappingKey = await deriveWrappingKey(secret, salt);
    const raw = await crypto.subtle.exportKey("raw", masterKey);
    const additionalData = encoder.encode("PocketLedger vault v1:" + purpose);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, wrappingKey, raw);
    return { kdf: KDF, iterations: ITERATIONS, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
  }
  async function unwrapMasterKey(wrapped, secret, purpose) {
    if (!wrapped || wrapped.kdf !== KDF || wrapped.iterations !== ITERATIONS) throw new Error("Unsupported vault key wrapper.");
    const wrappingKey = await deriveWrappingKey(secret, base64ToBytes(wrapped.salt));
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(wrapped.iv), additionalData: encoder.encode("PocketLedger vault v1:" + purpose) },
      wrappingKey, base64ToBytes(wrapped.ciphertext)
    );
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }
  function createRecoveryCode() {
    const bytes = randomBytes(32);
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return hex.match(/.{1,4}/g).join("-");
  }
  function normalizeRecoveryCode(value) {
    const raw = String(value || "").replace(/[\s-]/g, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(raw)) throw new Error("Recovery code must contain 64 hexadecimal characters.");
    return raw;
  }
  async function createVault(pin) {
    if (!/^\d{6}$/.test(pin)) throw new Error("A six-digit PIN is required.");
    const recoveryCode = createRecoveryCode();
    const masterKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const [pinWrapper, recoveryWrapper] = await Promise.all([
      wrapMasterKey(masterKey, pin, "pin"),
      wrapMasterKey(masterKey, normalizeRecoveryCode(recoveryCode), "recovery")
    ]);
    return {
      metadata: { version: VERSION, cipher: CIPHER, createdAt: new Date().toISOString(), pinWrapper, recoveryWrapper },
      recoveryCode,
      masterKey
    };
  }
  async function unlockWithPin(metadata, pin) {
    validateMetadata(metadata);
    return unwrapMasterKey(metadata.pinWrapper, pin, "pin");
  }
  async function unlockWithRecoveryCode(metadata, recoveryCode) {
    validateMetadata(metadata);
    return unwrapMasterKey(metadata.recoveryWrapper, normalizeRecoveryCode(recoveryCode), "recovery");
  }
  function validateMetadata(metadata) {
    if (!metadata || metadata.version !== VERSION || metadata.cipher !== CIPHER || !metadata.pinWrapper || !metadata.recoveryWrapper) {
      throw new Error("Vault metadata is incomplete or unsupported.");
    }
  }
  async function encryptRecord(masterKey, storeName, record) {
    if (!storeName || !record || (typeof record.id !== "string" && typeof record.id !== "number")) throw new Error("A store name and record ID are required.");
    const iv = randomBytes(12);
    const aad = encoder.encode("PocketLedger record v1:" + storeName + ":" + String(record.id));
    const plaintext = encoder.encode(JSON.stringify(record));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, masterKey, plaintext);
    return { id: record.id, __pocketLedgerEncrypted: true, version: VERSION, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
  }
  async function decryptRecord(masterKey, storeName, envelope) {
    if (!envelope || envelope.__pocketLedgerEncrypted !== true || envelope.version !== VERSION) throw new Error("Encrypted record envelope is invalid.");
    const aad = encoder.encode("PocketLedger record v1:" + storeName + ":" + String(envelope.id));
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv), additionalData: aad }, masterKey, base64ToBytes(envelope.ciphertext));
    const record = JSON.parse(decoder.decode(plaintext));
    if (String(record.id) !== String(envelope.id)) throw new Error("Encrypted record identity does not match its envelope.");
    return record;
  }
  async function encryptStore(masterKey, storeName, records) {
    if (!Array.isArray(records)) throw new Error("Store contents must be an array.");
    const result = [];
    for (const record of records) result.push(await encryptRecord(masterKey, storeName, record));
    return result;
  }
  async function decryptStore(masterKey, storeName, envelopes) {
    if (!Array.isArray(envelopes)) throw new Error("Encrypted store contents must be an array.");
    const result = [];
    for (const envelope of envelopes) result.push(await decryptRecord(masterKey, storeName, envelope));
    return result;
  }

  window.PocketLedgerVaultCrypto = Object.freeze({
    VERSION, KDF, ITERATIONS, CIPHER, createVault, unlockWithPin, unlockWithRecoveryCode,
    encryptRecord, decryptRecord, encryptStore, decryptStore, validateMetadata
  });
})();
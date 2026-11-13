(() => {
  "use strict";
  const STORAGE_KEY = "pocketledgerLocalLock_v1";
  const ITERATIONS = 310000;
  const IDLE_KEY = "pocketledgerAutoLockMinutes_v1";
  const ALLOWED_IDLE_MINUTES = [1, 5, 10, 15];
  let idleMinutes = 5;
  const $ = id => document.getElementById(id);
  const overlay = $("securityLock");
  const form = $("securityLockForm");
  const pinInput = $("securityPin");
  const confirmInput = $("securityPinConfirm");
  const title = $("securityLockTitle");
  const message = $("securityLockMessage");
  const submit = $("securityLockSubmit");
  const cancel = $("securityLockCancel");
  let mode = "setup";
  let firstPin = "";
  let resolveGate = null;
  let failures = 0;
  let lockedUntil = 0;
  let idleTimer = null;
  let lastActivity = Date.now();
  const encoder = new TextEncoder();

  function readConfig() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }
  function bytesToHex(bytes) { return [...bytes].map(x => x.toString(16).padStart(2, "0")).join(""); }
  function hexToBytes(hex) { return new Uint8Array((hex.match(/.{2}/g) || []).map(x => parseInt(x, 16))); }
  async function derive(pin, salt) {
    const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material, 256));
  }
  async function savePin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(pin, salt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, algorithm: "PBKDF2-SHA-256", iterations: ITERATIONS, salt: bytesToHex(salt), hash: bytesToHex(hash), updatedAt: new Date().toISOString() }));
  }
  async function verifyPin(pin) {
    const config = readConfig();
    if (!config || config.version !== 1 || config.iterations !== ITERATIONS || !config.salt || !config.hash) return false;
    const actual = await derive(pin, hexToBytes(config.salt));
    const expected = hexToBytes(config.hash);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  }
  function show(modeValue, heading, description, submitText, showConfirm = false, allowCancel = false) {
    mode = modeValue;
    title.textContent = heading;
    message.textContent = description;
    submit.textContent = submitText;
    confirmInput.hidden = !showConfirm;
    confirmInput.value = "";
    pinInput.value = "";
    cancel.hidden = !allowCancel;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => pinInput.focus());
  }
  function hide() {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    pinInput.value = "";
    confirmInput.value = "";
  }
  function setError(text) { $("securityLockStatus").textContent = text; }
  function lock() {
    show("unlock", "Welcome back", "Enter your six-digit PIN to open PocketLedger.", "Unlock");
    setError("");
  }
  function loadIdlePreference() {
    try {
      const value = Number(localStorage.getItem(IDLE_KEY));
      idleMinutes = ALLOWED_IDLE_MINUTES.includes(value) ? value : 5;
    } catch { idleMinutes = 5; }
    const control = $("securityAutoLockMinutes");
    if (control) control.value = String(idleMinutes);
  }
  function setIdlePreference(value) {
    const minutes = Number(value);
    if (!ALLOWED_IDLE_MINUTES.includes(minutes)) throw new Error("Choose 1, 5, 10, or 15 minutes.");
    idleMinutes = minutes;
    try { localStorage.setItem(IDLE_KEY, String(minutes)); }
    catch { throw new Error("Could not save the auto-lock preference in this browser."); }
    resetIdleTimer();
  }
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (overlay.hidden) idleTimer = setTimeout(lock, idleMinutes * 60 * 1000);
  }
  function markActivity() {
    if (overlay.hidden) resetIdleTimer();
  }
  async function submitForm(event) {
    event.preventDefault();
    const pin = pinInput.value;
    if (!/^\d{6}$/.test(pin)) { setError("Enter exactly six digits."); return; }
    if (mode === "setup" || mode === "change-new") {
      if (pin !== confirmInput.value) { setError("The PINs do not match. Try again."); return; }
      try { await savePin(pin); }
      catch { setError("Could not save your PIN in this browser. Check Safari storage settings."); return; }
      hide(); resetIdleTimer();
      if (mode === "setup" && resolveGate) { const done = resolveGate; resolveGate = null; done(true); }
      return;
    }
    if (mode === "change-verify") {
      if (!await verifyPin(pin)) { setError("Current PIN is incorrect."); return; }
      show("change-new", "Create a new PIN", "Choose a new six-digit PIN and confirm it.", "Save new PIN", true, true);
      return;
    }
    if (mode === "unlock") {
      if (Date.now() < lockedUntil) { setError("Too many attempts. Please wait before trying again."); return; }
      if (await verifyPin(pin)) {
        failures = 0; hide(); resetIdleTimer();
        if (resolveGate) { const done = resolveGate; resolveGate = null; done(true); }
      } else {
        failures++;
        if (failures >= 5) { lockedUntil = Date.now() + Math.min(30000 * (2 ** Math.floor((failures - 5) / 3)), 15 * 60 * 1000); }
        setError(failures >= 5 ? "Incorrect PIN. Too many attempts; wait before trying again." : "Incorrect PIN. Try again.");
        pinInput.value = "";
        pinInput.focus();
      }
    }
  }
  form.addEventListener("submit", submitForm);
  cancel.addEventListener("click", () => { hide(); });
  $("securityChangePin").addEventListener("click", () => {
    show("change-verify", "Verify it's you", "Enter your current PIN before changing it.", "Continue", false, true);
    setError("");
  });
  $("securityLockNow").addEventListener("click", lock);
  const idleControl = $("securityAutoLockMinutes");
  if (idleControl) {
    loadIdlePreference();
    idleControl.addEventListener("change", () => {
      try { setIdlePreference(idleControl.value); setError(""); }
      catch (error) { loadIdlePreference(); setError(error.message); }
    });
  }
  document.addEventListener("pointerdown", markActivity, { passive: true });
  document.addEventListener("keydown", markActivity);
  document.addEventListener("visibilitychange", () => { if (document.hidden && overlay.hidden) lock(); else if (!document.hidden && overlay.hidden) resetIdleTimer(); });
  window.addEventListener("pagehide", () => { if (overlay.hidden) lock(); });

  window.PocketLedgerLock = {
    initialize() {
      return new Promise(resolve => {
        resolveGate = resolve;
        const config = readConfig();
        if (!config) show("setup", "Create your PIN", "Set a six-digit PIN to protect access to PocketLedger on this device. No account or email is needed.", "Set PIN", true);
        else lock();
      });
    },
    lockNow: lock,
    setAutoLockMinutes: setIdlePreference,
    getAutoLockMinutes: () => idleMinutes
  };
})();
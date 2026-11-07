import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://ieszfyzndhuwzftdvglv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Y7Lxc8k_C8vsph2MCLuFMQ_Gfikl7jG";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

let appStarted = false;
let recoveryMode = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";

const styles = document.createElement("style");
styles.textContent = `
  body.auth-pending .app { display: none; }
  .auth-shell { min-height: 100svh; display:grid; place-items:center; padding:28px 20px; background:#f5f3eb; color:#203e32; font-family:inherit; }
  .auth-card { width:min(100%,420px); background:#fff; border:1px solid rgba(32,62,50,.12); border-radius:24px; padding:30px 24px; box-shadow:0 18px 50px rgba(22,42,32,.08); }
  .auth-brand { font-size:13px; letter-spacing:.12em; font-weight:700; color:#60796b; }
  .auth-card h1 { margin:10px 0 8px; font-size:30px; letter-spacing:-.04em; color:#203e32; }
  .auth-card p { color:#66756b; line-height:1.5; margin:0 0 22px; }
  .auth-card label { display:block; font-size:13px; font-weight:600; margin:14px 0 7px; color:#344b3e; }
  .auth-card input { width:100%; box-sizing:border-box; min-height:48px; border:1px solid #d9dfd8; border-radius:12px; padding:0 13px; background:#fff; color:#1d2b23; font:inherit; }
  .auth-actions { display:grid; gap:10px; margin-top:20px; }
  .auth-actions button { min-height:48px; border:0; border-radius:12px; padding:0 16px; font:inherit; font-weight:650; cursor:pointer; }
  .auth-primary { background:#203e32; color:#fff; }
  .auth-secondary { background:#edf1ec; color:#203e32; }
  .auth-link { display:block; margin:14px auto 0; border:0; background:none; color:#476b58; text-decoration:underline; font:inherit; cursor:pointer; }
  .auth-message { min-height:22px; margin-top:14px!important; font-size:13px; }
  .auth-message[data-kind="error"] { color:#a33b32; }
  .auth-message[data-kind="success"] { color:#276447; }
  .auth-legal { margin-top:18px!important; font-size:12px; }
`;
document.head.append(styles);

function renderAuth(mode = "signin", message = "", kind = "") {
  document.body.classList.add("auth-pending");
  document.querySelector(".auth-shell")?.remove();

  const isNewPassword = mode === "newpassword";
  const isSignup = mode === "signup";
  const isReset = mode === "reset";
  const title = isNewPassword ? "Choose a new password" : isSignup ? "Create your account" : isReset ? "Reset your password" : "Welcome back";
  const intro = isNewPassword
    ? "Set a new password for your PocketLedger account."
    : isSignup
      ? "Create an account to access PocketLedger."
      : isReset
        ? "We’ll email you a secure password-reset link."
        : "Sign in to continue to your personal ledger.";

  const shell = document.createElement("section");
  shell.className = "auth-shell";
  shell.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">PERSONAL FINANCE</div>
      <h1>PocketLedger<span style="color:#64866f">.</span></h1>
      <p>${intro}</p>
      <form id="authForm">
        ${isNewPassword ? "" : '<label for="authEmail">Email address</label><input id="authEmail" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>'}
        ${isReset ? "" : '<label for="authPassword">' + (isNewPassword ? "New password" : "Password") + '</label><input id="authPassword" name="password" type="password" autocomplete="' + (isNewPassword ? "new-password" : isSignup ? "new-password" : "current-password") + '" minlength="8" placeholder="' + (isNewPassword ? "At least 8 characters" : "Your password") + '" required>'}
        <div class="auth-actions">
          <button class="auth-primary" type="submit">${isNewPassword ? "Save new password" : isSignup ? "Create account" : isReset ? "Send reset link" : "Sign in"}</button>
        </div>
      </form>
      <button class="auth-link" id="authSwitch" type="button">${isSignup ? "Already have an account? Sign in" : "Create an account"}</button>
      ${!isNewPassword && !isReset && !isSignup ? '<button class="auth-link" id="authForgot" type="button">Forgot password?</button>' : ""}
      <p class="auth-message" id="authMessage" role="status" aria-live="polite" data-kind="${kind}"></p>
      <p class="auth-legal">Your financial records remain stored locally on this device. Signing in does not upload them.</p>
    </div>`;
  document.body.prepend(shell);
  const initialMessage = shell.querySelector("#authMessage");
  initialMessage.textContent = message;

  const form = shell.querySelector("#authForm");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = form.querySelector("button[type=submit]");
    const status = shell.querySelector("#authMessage");
    submit.disabled = true;
    submit.textContent = "Please wait…";
    status.textContent = "";
    status.dataset.kind = "";

    try {
      if (isNewPassword) {
        const password = form.elements.password.value;
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        recoveryMode = false;
        await supabase.auth.getSession();
        renderAuth("signin", "Password updated. Sign in with your new password.", "success");
        return;
      }

      const email = form.elements.email.value.trim();
      if (isReset) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + location.pathname
        });
        if (error) throw error;
        status.textContent = "If an account exists for that email, a reset link has been sent.";
        status.dataset.kind = "success";
      } else if (isSignup) {
        const password = form.elements.password.value;
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          await startApp();
        } else {
          status.textContent = "Account created. Check your email to confirm your address, then sign in.";
          status.dataset.kind = "success";
        }
      } else {
        const password = form.elements.password.value;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await startApp();
      }
    } catch (error) {
      status.textContent = error.message || "Something went wrong. Please try again.";
      status.dataset.kind = "error";
    } finally {
      if (document.body.contains(shell)) {
        submit.disabled = false;
        submit.textContent = isNewPassword ? "Save new password" : isSignup ? "Create account" : isReset ? "Send reset link" : "Sign in";
      }
    }
  });

  shell.querySelector("#authSwitch")?.addEventListener("click", () => {
    renderAuth(isSignup ? "signin" : "signup");
  });
  shell.querySelector("#authForgot")?.addEventListener("click", () => renderAuth("reset"));
}

async function startApp() {
  if (appStarted) return;
  appStarted = true;
  document.body.classList.remove("auth-pending");
  document.querySelector(".auth-shell")?.remove();
  const script = document.createElement("script");
  script.src = "./app.js";
  script.onload = () => {
    const header = document.querySelector(".app header");
    if (header && !document.getElementById("pocketLedgerSignOut")) {
      const signOut = document.createElement("button");
      signOut.id = "pocketLedgerSignOut";
      signOut.type = "button";
      signOut.className = "secondary";
      signOut.textContent = "Sign out";
      signOut.style.marginLeft = "8px";
      signOut.addEventListener("click", async () => {
        signOut.disabled = true;
        signOut.textContent = "Signing out…";
        const { error } = await supabase.auth.signOut();
        if (error) {
          signOut.disabled = false;
          signOut.textContent = "Sign out";
          alert(error.message || "Could not sign out.");
        }
      });
      header.append(signOut);
    }
  };
  script.onerror = () => {
    appStarted = false;
    renderAuth("signin", "PocketLedger could not load. Please refresh and try again.", "error");
  };
  document.body.append(script);
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    renderAuth("newpassword");
  } else if (event === "SIGNED_OUT") {
    appStarted = false;
    location.reload();
  } else if (event === "SIGNED_IN" && session && !recoveryMode) {
    startApp();
  }
});

async function boot() {
  if (recoveryMode) {
    renderAuth("newpassword");
    return;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    renderAuth("signin", error.message, "error");
    return;
  }
  if (data.session) await startApp();
  else renderAuth("signin");
}

boot().catch(error => renderAuth("signin", error.message, "error"));

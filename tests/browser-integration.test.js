import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml"
};
let server, browser, baseUrl;

test("PocketLedger browser workflows persist isolated account, ledger, transfer, budget and goal data", { timeout: 90000 }, async t => {
  t.after(async () => { if (browser) await browser.close().catch(() => {}); if (server?.listening) await new Promise(resolve => server.close(resolve)); });
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const target = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404); res.end("Not found"); return;
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#termsDialog").waitFor({ state: "visible" });
  await page.locator("#termsConsent").check();
  await page.locator("#termsAccept").click();
  await page.locator("#securityLock").waitFor({ state: "visible" });
  await page.locator("#securityPin").fill("246810");
  await page.locator("#securityPinConfirm").fill("246810");
  await page.locator("#securityLockSubmit").click();
  await page.locator("#homeScreen.active").waitFor();
  await page.locator("#integrityStatus").filter({ hasText: "No structural issues detected." }).waitFor({ timeout: 15000 });

  // Create two independent asset accounts in this clean browser context.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator(".account-add-details").locator("summary").click();
  await page.locator("#accountName").fill("Test Cash");
  await page.locator("#accountType").selectOption("Cash");
  await page.locator("#accountClassification").selectOption("asset");
  await page.locator("#openingBalance").fill("1000000");
  await page.locator("#openingDate").fill("2026-11-01");
  await page.locator("#accountForm button[type=submit]").click();
  await page.locator("#accountStatus").filter({ hasText: "Account added." }).waitFor();

  await page.locator("#accountName").fill("Test Bank");
  await page.locator("#accountType").selectOption("Bank");
  await page.locator("#accountClassification").selectOption("asset");
  await page.locator("#openingBalance").fill("200000");
  await page.locator("#openingDate").fill("2026-11-01");
  await page.locator("#accountForm button[type=submit]").click();
  await page.locator("#accountStatus").filter({ hasText: "Account added." }).waitFor();

  const accountIds = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("PocketLedgerDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("accounts", "readonly");
      const get = tx.objectStore("accounts").getAll();
      get.onsuccess = () => resolve(get.result.map(x => ({ id: x.id, name: x.name })));
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
    };
  }));
  const cash = accountIds.find(x => x.name === "Test Cash");
  const bank = accountIds.find(x => x.name === "Test Bank");
  assert.ok(cash && bank, "both test accounts should be stored");

  // Add a linked expense, then transfer between the two accounts.
  await page.getByRole("button", { name: "Transactions" }).click();
  await page.locator("#description").fill("Browser test lunch");
  await page.locator("#amount").fill("150000");
  await page.locator("#date").fill("2026-11-09");
  await page.locator("#transactionAccount").selectOption(cash.id);
  await page.locator("#category").selectOption("Food");
  await page.locator("#form button[type=submit]").click();
  await page.locator("#status").filter({ hasText: "Transaction saved" }).waitFor();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator("#transferFrom").selectOption(cash.id);
  await page.locator("#transferTo").selectOption(bank.id);
  await page.locator("#transferAmount").fill("100000");
  await page.locator("#transferDate").fill("2026-11-09");
  await page.locator("#transferDescription").fill("Browser test transfer");
  await page.locator("#transferForm button[type=submit]").click();
  await page.locator("#transferStatus").filter({ hasText: "Transfer saved" }).waitFor();

  // Create monthly and category budgets.
  await page.getByRole("button", { name: "Budgets" }).click();
  await page.locator("#budgetMonth").fill("2026-11");
  await page.locator("#globalBudgetAmount").fill("5000000");
  await page.locator("#globalBudgetForm button[type=submit]").click();
  await page.waitForFunction(() => document.querySelector("#globalBudgetStatus")?.textContent.trim().length > 0, null, { timeout: 10000 }).catch(async () => { throw new Error("Global budget status stayed blank; month=" + await page.locator("#budgetMonth").inputValue() + ", amountValue=" + await page.locator("#globalBudgetAmount").inputValue() + ", amountType=" + await page.locator("#globalBudgetAmount").getAttribute("type") + ", amountValidity=" + await page.locator("#globalBudgetAmount").evaluate(el => JSON.stringify({valid:el.validity.valid, valueMissing:el.validity.valueMissing, rangeUnderflow:el.validity.rangeUnderflow, stepMismatch:el.validity.stepMismatch, validationMessage:el.validationMessage})) + ", pageErrors=" + pageErrors.join(" | ")); });
  assert.match(await page.locator("#globalBudgetStatus").textContent(), /saved successfully/i);
  await page.locator("#budgetCategory").selectOption("Food");
  await page.locator("#categoryBudgetAmount").fill("1000000");
  await page.locator("#categoryBudgetForm button[type=submit]").click();
  await page.locator("#categoryBudgetStatus").filter({ hasText: "budget saved successfully" }).waitFor();

  // Create a savings goal.
  await page.locator(".goal-create-details summary").click();
  await page.locator("#goalName").fill("Browser test reserve");
  await page.locator("#goalTarget").fill("500000");
  await page.locator("#goalSaved").fill("100000");
  await page.locator("#savingsGoalForm button[type=submit]").click();
  await page.locator("#goalStatus").filter({ hasText: "saved on this device" }).waitFor();

  // Verify actual IndexedDB records and accounting movements without touching user data.
  const snapshot = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("PocketLedgerDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const names = ["transactions", "budgets", "accounts", "journalEntries", "transfers", "savingsGoals", "monthlySnapshots"];
      const tx = db.transaction(names, "readonly"), data = {};
      let remaining = names.length;
      for (const name of names) {
        const get = tx.objectStore(name).getAll();
        get.onsuccess = () => { data[name] = get.result; if (--remaining === 0) resolve(data); };
        get.onerror = () => reject(get.error);
      }
      tx.oncomplete = () => db.close();
    };
  }));
  assert.equal(snapshot.accounts.length, 2);
  assert.equal(snapshot.transactions.length, 1);
  assert.equal(snapshot.transfers.length, 1);
  assert.equal(snapshot.budgets.length, 2);
  assert.equal(snapshot.savingsGoals.length, 1);
  assert.equal(snapshot.journalEntries.filter(x => x.accountId).length, 5, "two opening balances, expense and transfer should create five account-side ledger rows");
  assert.equal(snapshot.transactions[0].accountId, cash.id);
  assert.equal(snapshot.transactions[0].amount, 150000);
  assert.equal(snapshot.transfers[0].amount, 100000);
  assert.equal(snapshot.savingsGoals[0].savedAmount, 100000);
  const cashBalance = 1000000 + snapshot.journalEntries.filter(x => x.accountId === cash.id).reduce((sum, x) => sum + x.balanceDelta, 0);
  const bankBalance = 200000 + snapshot.journalEntries.filter(x => x.accountId === bank.id).reduce((sum, x) => sum + x.balanceDelta, 0);
  assert.equal(cashBalance, 750000, "cash should reflect expense and outgoing transfer");
  assert.equal(bankBalance, 300000, "bank should reflect incoming transfer");

  // Reload verifies the same records survive a real browser navigation.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#securityLock").waitFor({ state: "visible" });
  await page.locator("#securityPin").fill("000000");
  await page.locator("#securityLockSubmit").click();
  await page.locator("#securityLockStatus").filter({ hasText: "Incorrect PIN" }).waitFor();
  await page.locator("#securityPin").fill("246810");
  await page.locator("#securityLockSubmit").click();
  await page.locator("#homeScreen.active").waitFor();
  const persisted = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("PocketLedgerDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(["transactions", "transfers", "accounts"], "readonly");
      const data = {};
      for (const name of ["transactions", "transfers", "accounts"]) {
        const get = tx.objectStore(name).getAll();
        get.onsuccess = () => { data[name] = get.result; if (Object.keys(data).length === 3) resolve(data); };
      }
      tx.oncomplete = () => db.close();
    };
  }));
  assert.equal(persisted.transactions.length, 1);
  assert.equal(persisted.transfers.length, 1);
  assert.equal(persisted.accounts.length, 2);
  assert.deepEqual(pageErrors, [], "browser should not report uncaught page errors");

  await context.close();
});

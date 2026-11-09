const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../finance-core.js");

test("monthly ranges respect month length and leap years", () => {
  assert.deepEqual(core.getPeriodRange("2024-02-14", "monthly"), ["2024-02-01", "2024-02-29"]);
  assert.deepEqual(core.getPeriodRange("2025-02-14", "monthly"), ["2025-02-01", "2025-02-28"]);
  assert.equal(core.daysInMonth("2024-02"), 29);
  assert.equal(core.daysInMonth("2026-11"), 30);
});

test("daily and yearly ranges are inclusive ISO date ranges", () => {
  assert.deepEqual(core.getPeriodRange("2026-11-08", "daily"), ["2026-11-08", "2026-11-08"]);
  assert.deepEqual(core.getPeriodRange("2026-11-08", "yearly"), ["2026-01-01", "2026-12-31"]);
});

test("invalid dates and months are rejected", () => {
  assert.equal(core.isValidDate("2026-02-29"), false);
  assert.equal(core.isValidMonth("2026-13"), false);
  assert.throws(() => core.getPeriodRange("2026-02-29", "monthly"), RangeError);
});

test("monthly expense totals include both month boundaries and exclude adjacent dates", () => {
  const rows = [
    { type: "expense", date: "2024-02-01", amount: 100 },
    { type: "expense", date: "2024-02-29", amount: 250 },
    { type: "income", date: "2024-02-15", amount: 900 },
    { type: "expense", date: "2024-03-01", amount: 400 },
    { type: "expense", date: "2024-01-31", amount: 500 },
    { type: "expense", date: "2024-02-30", amount: 700 }
  ];
  assert.equal(core.sumAmounts(core.expenseRowsForMonth(rows, "2024-02")), 350);
});

test("category totals group expenses and put missing categories under Other", () => {
  const totals = core.categoryTotals([
    { type: "expense", category: "Food", amount: 1200 },
    { type: "expense", category: "Food", amount: 800 },
    { type: "expense", category: "Transport", amount: 500 },
    { type: "expense", amount: 100 },
    { type: "income", category: "Food", amount: 9999 }
  ]);
  assert.equal(totals.Food, 2000);
  assert.equal(totals.Transport, 500);
  assert.equal(totals.Other, 100);
});

test("budget metrics cover under-budget, warning, and over-budget cases", () => {
  const under = core.calculateBudgetMetrics(700, 1000, 30);
  assert.equal(under.remaining, 300);
  assert.equal(under.percentUsed, 70);
  assert.equal(under.warning, false);
  assert.equal(under.dailyAverage, 700 / 30);
  const warning = core.calculateBudgetMetrics(800, 1000, 31);
  assert.equal(warning.warning, true);
  assert.equal(warning.overBudget, false);
  const over = core.calculateBudgetMetrics(1200, 1000, 30);
  assert.equal(over.remaining, -200);
  assert.equal(over.percentUsed, 120);
  assert.equal(over.progressPercent, 100);
  assert.equal(over.overBudget, true);
});

test("goal progress reports remaining amount and caps the visual percentage", () => {
  assert.deepEqual(core.calculateGoalProgress(2500, 10000), { saved: 2500, target: 10000, remaining: 7500, percent: 25, isComplete: false });
  assert.equal(core.calculateGoalProgress(10000, 10000).percent, 100);
  const overfunded = core.calculateGoalProgress(12000, 10000);
  assert.equal(overfunded.remaining, 0);
  assert.equal(overfunded.percent, 100);
  assert.equal(overfunded.isComplete, true);
});


test("monthly recurrence stays anchored to the original day across short months", () => {
  assert.equal(core.nextRecurringDate("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(core.nextRecurringDate("2026-02-28", "monthly", "2026-01-31"), "2026-03-31");
  assert.equal(core.nextRecurringDate("2026-03-31", "monthly", "2026-01-31"), "2026-04-30");
  assert.equal(core.nextRecurringDate("2026-04-30", "monthly", "2026-01-31"), "2026-05-31");
});

test("yearly recurrence preserves leap-day anniversaries", () => {
  assert.equal(core.nextRecurringDate("2024-02-29", "yearly"), "2025-02-28");
  assert.equal(core.nextRecurringDate("2025-02-28", "yearly", "2024-02-29"), "2026-02-28");
  assert.equal(core.nextRecurringDate("2027-02-28", "yearly", "2024-02-29"), "2028-02-29");
});

test("weekly recurrence advances by exactly seven calendar days", () => {
  assert.equal(core.nextRecurringDate("2026-12-28", "weekly"), "2027-01-04");
});

test("recurrence rejects invalid dates and unsupported frequencies", () => {
  assert.throws(() => core.nextRecurringDate("2026-02-30", "monthly"), RangeError);
  assert.throws(() => core.nextRecurringDate("2026-02-28", "daily"), RangeError);
});


test("asset and liability ledger movements use opposite balance signs", () => {
  assert.equal(core.calculateLedgerBalanceDelta("asset", "increase", 125000), 125000);
  assert.equal(core.calculateLedgerBalanceDelta("asset", "decrease", 125000), -125000);
  assert.equal(core.calculateLedgerBalanceDelta("liability", "increase", 125000), -125000);
  assert.equal(core.calculateLedgerBalanceDelta("liability", "decrease", 125000), 125000);
});

test("account balances combine opening balance with only that account's ledger movements", () => {
  const entries = [
    { accountId: "bank-a", balanceDelta: -25000 },
    { accountId: "bank-b", balanceDelta: 90000 },
    { accountId: "bank-a", balanceDelta: 10000 }
  ];
  assert.equal(core.calculateAccountBalance(500000, entries, "bank-a"), 485000);
  assert.equal(core.calculateAccountBalance(0, entries, "bank-b"), 90000);
});

test("account balance rejects malformed movements and unsafe totals", () => {
  assert.throws(() => core.calculateAccountBalance(-1, [], "a"), RangeError);
  assert.throws(() => core.calculateAccountBalance(100, [{ accountId: "a", balanceDelta: 1.5 }], "a"), RangeError);
  assert.throws(() => core.calculateAccountBalance(Number.MAX_SAFE_INTEGER, [{ accountId: "a", balanceDelta: 1 }], "a"), RangeError);
});

test("credit metrics expose available credit and over-limit status accurately", () => {
  assert.deepEqual(core.calculateCreditMetrics(10000000, 2500000), {
    limit: 10000000, outstanding: 2500000, availableCredit: 7500000,
    utilizationPercent: 25, progressPercent: 25, isOverLimit: false
  });
  const over = core.calculateCreditMetrics(10000000, 10500000);
  assert.equal(over.availableCredit, -500000);
  assert.equal(over.progressPercent, 100);
  assert.equal(over.isOverLimit, true);
  assert.equal(core.calculateCreditMetrics(0, 0).utilizationPercent, 0);
});

test("ledger movements reject invalid directions and non-positive amounts", () => {
  assert.throws(() => core.calculateLedgerBalanceDelta("asset", "transfer", 10), RangeError);
  assert.throws(() => core.calculateLedgerBalanceDelta("liability", "increase", 0), RangeError);
});

test("backup envelope requires the supported encryption parameters and correctly sized keys", () => {
  const envelope = { format: "pocketledger-encrypted-backup", version: 1, cipher: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations: 310000, salt: "AAAAAAAAAAAAAAAAAAAAAA==", iv: "AAAAAAAAAAAAAAAA", ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAA" };
  assert.equal(core.validateBackupEnvelope(envelope), true);
  assert.throws(() => core.validateBackupEnvelope({ ...envelope, iterations: 1000 }), RangeError);
  assert.throws(() => core.validateBackupEnvelope({ ...envelope, iv: "short" }), RangeError);
});

test("backup payload validates all six stores and rejects malformed records before restore", () => {
  const stores = ["transactions", "budgets", "accounts", "journalEntries", "transfers", "savingsGoals"];
  const data = Object.fromEntries(stores.map(name => [name, []]));
  data.transactions.push({ id: 1, type: "expense", amount: 25000, date: "2026-11-09", description: "Lunch" });
  data.budgets.push({ id: "2026-11_Food", month: "2026-11", category: "Food", amount: 1000000 });
  data.accounts.push({ id: "cash", name: "Cash", classification: "asset", openingBalance: 100000 }, { id: "bank", name: "Bank", classification: "asset", openingBalance: 0 });
  data.journalEntries.push({ id: "je1", accountId: "cash", amount: 10000, balanceDelta: -10000, date: "2026-11-09" });
  data.transfers.push({ id: "tr1", fromAccountId: "cash", toAccountId: "bank", amount: 10000, date: "2026-11-09" });
  data.savingsGoals.push({ id: "goal1", name: "Emergency fund", targetAmount: 1000000, savedAmount: 250000 });
  assert.equal(core.validateBackupData(data, stores), true);
  assert.throws(() => core.validateBackupData({ ...data, budgets: [{ id: "bad", month: "2026-13", category: "Food", amount: 1000 }] }, stores), RangeError);
  assert.throws(() => core.validateBackupData({ ...data, savingsGoals: [{ id: "bad", name: "", targetAmount: 0, savedAmount: -1 }] }, stores), RangeError);
  assert.throws(() => core.validateBackupData({ ...data, accounts: [{ id: "cash" }, { id: "cash" }] }, stores), RangeError);
  assert.throws(() => core.validateBackupData({ ...data, transfers: [] }, [...stores, "missingStore"]), RangeError);
  assert.throws(() => core.validateBackupData({ ...data, transfers: [{ id: "tr2", fromAccountId: "cash", toAccountId: "missing", amount: 1000, date: "2026-11-09" }] }, stores), RangeError);
  assert.throws(() => core.validateBackupData({ ...data, transactions: [{ id: 2, type: "expense", amount: 1000, date: "2026-11-09", description: "Missing account", accountId: "ghost" }] }, stores), RangeError);
});

test("net worth history reconstructs assets, liabilities and dated ledger movements", () => {
  const accounts = [
    { id: "cash", classification: "asset", openingBalance: 100000, openingBalanceDate: "2026-01-01" },
    { id: "loan", classification: "liability", openingBalance: 50000, openingBalanceDate: "2026-01-01" },
    { id: "late", classification: "asset", openingBalance: 90000, openingBalanceDate: "2026-03-15" }
  ];
  const entries = [
    { accountId: "cash", date: "2026-01-31", balanceDelta: -10000 },
    { accountId: "cash", date: "2026-02-01", balanceDelta: 20000 },
    { accountId: "loan", date: "2026-02-15", balanceDelta: -5000 },
    { accountId: "late", date: "2026-03-14", balanceDelta: 10000 },
    { accountId: "late", date: "2026-03-20", balanceDelta: 5000 },
    { accountId: "cash", date: "2026-04-01", balanceDelta: 100000 }
  ];
  const history = core.calculateNetWorthHistory(accounts, entries, ["2026-01", "2026-02", "2026-03", "2026-04"], "2026-03-25");
  assert.deepEqual(history.map(({ assets, liabilities, netWorth }) => ({ assets, liabilities, netWorth })), [
    { assets: 90000, liabilities: 50000, netWorth: 40000 },
    { assets: 120000, liabilities: 45000, netWorth: 75000 },
    { assets: 195000, liabilities: 45000, netWorth: 150000 },
    { assets: 195000, liabilities: 45000, netWorth: 150000 }
  ]);
  assert.equal(history[3].cutoff, "2026-03-25");
});

test("net worth history excludes activity before opening and after the current date", () => {
  const history = core.calculateNetWorthHistory(
    [{ id: "asset", classification: "asset", openingBalance: 1000, openingBalanceDate: "2026-02-10" }],
    [{ accountId: "asset", date: "2026-02-09", balanceDelta: 500 }, { accountId: "asset", date: "2026-02-20", balanceDelta: 200 }, { accountId: "asset", date: "2026-03-01", balanceDelta: 300 }],
    ["2026-01", "2026-02", "2026-03"], "2026-02-20"
  );
  assert.deepEqual(history.map(item => item.netWorth), [0, 1200, 1200]);
  assert.throws(() => core.calculateNetWorthHistory([], [], ["2026-13"], "2026-02-20"), RangeError);
});

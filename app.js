
const $ = id => document.getElementById(id);

const CATEGORY_ICON_PATHS = {
  Food: '<path d="M3 2v7a3 3 0 0 0 3 3v10M6 2v5M9 2v5M6 12v10M18 2v20M18 2c-2 2-3 5-3 8h3"/>',
  Transport: '<path d="M5 17h14l1-6-2-5H6l-2 5 1 6Z"/><path d="M5 11h14M7 17v3m10-3v3M7 14h.01M17 14h.01"/>',
  Shopping: '<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  Housing: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-7h6v7"/>',
  Bills: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  Health: '<path d="M12 21s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11Z"/><path d="M8 12h8m-4-4v8"/>',
  Entertainment: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/>',
  Salary: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  Business: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
  Investment: '<path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  Other: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8m-4-4h8"/>'
};
function categoryIcon(category) {
  const drawing = CATEGORY_ICON_PATHS[category] || CATEGORY_ICON_PATHS.Other;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${drawing}</svg>`;
}

const money = n => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(n);

function localDate() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

function currentMonth() {
  return localDate().slice(0, 7);
}

let db;
let dashboardPeriod = "monthly";

// Privacy preference is stored separately from financial records.
let balancesHidden = false;
try {
  balancesHidden =
    localStorage.getItem("pocketledgerBalancesHidden") === "true";
} catch (error) {
  console.warn("Privacy preference storage is unavailable.", error);
}

function setSensitiveText(element, value) {
  const text = String(value);
  element.dataset.sensitiveValue = text;
  element.dataset.sensitive = "true";
  element.textContent = balancesHidden ? "••••••" : text;
}

function setSensitiveInput(input, value) {
  input.value = value === "" ? "" : String(value);
  input.type = balancesHidden ? "password" : "number";
}

function applyPrivacyMode() {
  document.querySelectorAll('[data-sensitive="true"]').forEach(element => {
    element.textContent = balancesHidden
      ? "••••••"
      : (element.dataset.sensitiveValue || "");
  });

  document.querySelectorAll("[data-sensitive-input]").forEach(input => {
    input.type = balancesHidden ? "password" : "number";
  });

  const button = $("privacyToggle");
  if (!button) return;

  button.setAttribute("aria-pressed", String(balancesHidden));
  button.setAttribute(
    "aria-label",
    balancesHidden ? "Show financial amounts" : "Hide financial amounts"
  );
  button.title = balancesHidden ? "Show financial amounts" : "Hide financial amounts";
  button.innerHTML = balancesHidden
    ? `<svg class="privacy-icon" viewBox="0 0 24 24" aria-hidden="true">
         <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/>
         <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.5 0 2.8-.4 4-1"/>
       </svg><span>Show</span>`
    : `<svg class="privacy-icon" viewBox="0 0 24 24" aria-hidden="true">
         <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/>
         <circle cx="12" cy="12" r="3"/>
       </svg><span>Hide</span>`;
}

function togglePrivacyMode() {
  balancesHidden = !balancesHidden;
  try {
    localStorage.setItem("pocketledgerBalancesHidden", String(balancesHidden));
  } catch (error) {
    console.warn("Could not save privacy preference.", error);
  }
  applyPrivacyMode();
}

const categories = [
  "Food", "Transport", "Shopping", "Housing",
  "Bills", "Health", "Entertainment", "Other"
];

// DATABASE
// Version 3 adds accounts and ledger records without deleting existing data.

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PocketLedgerDB", 3);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("transactions")) {
        database.createObjectStore("transactions", {
          keyPath: "id",
          autoIncrement: true
        });
      }

      if (!database.objectStoreNames.contains("budgets")) {
        database.createObjectStore("budgets", {
          keyPath: "id"
        });
      }

      if (!database.objectStoreNames.contains("accounts")) {
        const accounts = database.createObjectStore("accounts", { keyPath: "id" });
        accounts.createIndex("byActive", "active", { unique: false });
      }
      if (!database.objectStoreNames.contains("journalEntries")) {
        const entries = database.createObjectStore("journalEntries", { keyPath: "id" });
        entries.createIndex("byAccount", "accountId", { unique: false });
        entries.createIndex("byDate", "date", { unique: false });
      }
      if (!database.objectStoreNames.contains("transfers")) {
        const transfers = database.createObjectStore("transfers", { keyPath: "id" });
        transfers.createIndex("byDate", "date", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function operation(storeName, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

const all = () =>
  operation("transactions", "readonly", s => s.getAll());

const add = item =>
  operation("transactions", "readwrite", s => s.add(item));

const remove = id =>
  operation("transactions", "readwrite", s => s.delete(id));

const allBudgets = () =>
  operation("budgets", "readonly", s => s.getAll());

const saveBudget = item =>
  operation("budgets", "readwrite", s => s.put(item));

const removeBudget = id =>
  operation("budgets", "readwrite", s => s.delete(id));

// Multi-store writes resolve only after IndexedDB commits successfully.
function atomicWrite(storeNames, writer) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    let result;
    try { result = writer(tx); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("Database write failed."));
    tx.onabort = () => reject(tx.error || new Error("Database write was cancelled."));
  });
}
const allAccounts = () => operation("accounts", "readonly", s => s.getAll());
const allJournalEntries = () => operation("journalEntries", "readonly", s => s.getAll());
const allTransfers = () => operation("transfers", "readonly", s => s.getAll());
const makeId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

async function accountBalances() {
  const [accounts, entries] = await Promise.all([allAccounts(), allJournalEntries()]);
  return accounts.map(account => {
    const movement = entries.filter(entry => entry.accountId === account.id)
      .reduce((sum, entry) => sum + Number(entry.balanceDelta || 0), 0);
    return { ...account, balance: Number(account.openingBalance || 0) + movement };
  });
}

function ledgerEntry(account, amount, direction, date, details) {
  // balanceDelta is positive when the account's displayed balance increases.
  const assetDelta = direction === "increase" ? amount : -amount;
  const balanceDelta = account.classification === "liability" ? -assetDelta : assetDelta;
  return { id: makeId("je"), accountId: account.id, amount,
    side: direction === "increase" ? "debit" : "credit",
    balanceDelta, date, ...details, createdAt: new Date().toISOString() };
}

// DATE HELPERS

function getPeriodRange(date, period) {
  const [year, month, day] = date.split("-").map(Number);

  if (period === "daily") {
    return [date, date];
  }

  if (period === "monthly") {
    const lastDay = new Date(year, month, 0).getDate();

    return [
      `${year}-${String(month).padStart(2, "0")}-01`,
      `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    ];
  }

  return [`${year}-01-01`, `${year}-12-31`];
}

function periodDescription(date, period) {
  const [year, month, day] = date.split("-").map(Number);

  if (period === "daily") {
    return new Date(year, month - 1, day).toLocaleDateString(
      "en-ID",
      { day: "numeric", month: "long", year: "numeric" }
    );
  }

  if (period === "monthly") {
    return new Date(year, month - 1, 1).toLocaleDateString(
      "en-ID",
      { month: "long", year: "numeric" }
    );
  }

  return String(year);
}

function monthLabel(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);

  return new Date(year, month - 1, 1).toLocaleDateString(
    "en-ID",
    { month: "long", year: "numeric" }
  );
}

// NAVIGATION

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.toggle("active", screen.id === screenId);
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.screen === screenId
    );
  });

  if (screenId === "budgetsScreen") {
    renderBudgets().catch(console.error);
  }

  if (screenId === "homeScreen") {
    render().catch(console.error);
    renderAnalytics().catch(console.error);
  }

  if (screenId === "transactionsScreen") {
    renderTransactions().catch(console.error);
  }
  if (screenId === "settingsScreen") {
    renderAccounts().catch(console.error);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => {
    showScreen(button.dataset.screen);
  });
});

$("privacyToggle").addEventListener("click", togglePrivacyMode);

// DASHBOARD

async function render() {
  const selectedDate = $("month").value || localDate();
  const [startDate, endDate] = getPeriodRange(selectedDate, dashboardPeriod);
  const rows = (await all())
    .filter(x => x.date >= startDate && x.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const income = rows.filter(x => x.type === "income")
    .reduce((sum, x) => sum + x.amount, 0);
  const expenses = rows.filter(x => x.type === "expense")
    .reduce((sum, x) => sum + x.amount, 0);

  setSensitiveText($("income"), money(income));
  setSensitiveText($("expenses"), money(expenses));
  setSensitiveText($("balance"), money(income - expenses));
  $("balance").classList.toggle("negative-value", income - expenses < 0);
  $("count").textContent = `${rows.length} items`;
  $("balanceLabel").textContent = `${dashboardPeriod.toUpperCase()} BALANCE`;
  $("dashboardSubtitle").textContent =
    `${dashboardPeriod.charAt(0).toUpperCase() + dashboardPeriod.slice(1)} overview · ${periodDescription(selectedDate, dashboardPeriod)}`;

  document.querySelectorAll(".period-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.period === dashboardPeriod);
  });

  const activeDays = new Set(rows.map(x => x.date)).size;
  const insights = [
    ["Transactions", String(rows.length)],
    ["Active days", String(activeDays)],
    ["Average daily spending", money(activeDays ? expenses / activeDays : 0)],
    ["Savings rate", income > 0 ? `${((income - expenses) / income * 100).toFixed(1)}%` : "—"]
  ];
  const container = $("periodInsights");
  container.replaceChildren();
  for (const [label, value] of insights) {
    const card = document.createElement("div");
    card.className = "insight-card";
    const title = document.createElement("span");
    title.textContent = label;
    const amount = document.createElement("strong");
    if (label === "Average daily spending") setSensitiveText(amount, value);
    else amount.textContent = value;
    card.append(title, amount);
    container.append(card);
  }

  await renderDashboardSnapshot();
  await renderRecentActivity();
}

async function renderDashboardSnapshot() {
  const accounts = (await accountBalances()).filter(account => account.active !== false);
  const assets = accounts.filter(account => account.classification === "asset")
    .reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const liabilities = accounts.filter(account => account.classification === "liability")
    .reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const netWorth = assets - liabilities;
  setSensitiveText($("dashboardNetWorth"), money(netWorth));
  setSensitiveText($("dashboardAssets"), money(assets));
  setSensitiveText($("dashboardLiabilities"), money(liabilities));
  $("dashboardNetWorth").classList.toggle("negative-value", netWorth < 0);
}

async function renderRecentActivity() {
  const rows = (await all()).sort((a, b) =>
    b.date.localeCompare(a.date) || b.id - a.id
  ).slice(0, 4);
  const container = $("dashboardRecentList");
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No transactions yet. Add your first expense or income to get started.";
    container.append(empty);
    return;
  }
  for (const item of rows) {
    const row = document.createElement("div");
    row.className = "dashboard-recent-row";
    const icon = document.createElement("span");
    icon.className = "dashboard-category-icon";
    icon.innerHTML = categoryIcon(item.category);
    const info = document.createElement("div");
    info.className = "dashboard-recent-info";
    const title = document.createElement("strong");
    title.textContent = item.description;
    const meta = document.createElement("small");
    const parsed = new Date(item.date + "T00:00:00");
    meta.textContent = `${item.category || "Other"} · ${parsed.toLocaleDateString("en-ID", {day:"numeric",month:"short"})}`;
    info.append(title, meta);
    const amount = document.createElement("strong");
    amount.className = item.type === "income" ? "recent-income" : "recent-expense";
    setSensitiveText(amount, `${item.type === "income" ? "+" : "−"}${money(item.amount)}`);
    row.append(icon, info, amount);
    container.append(row);
  }
}

// TRANSACTIONS

async function renderTransactions() {
  const rows = (await all()).sort((a, b) =>
    b.date.localeCompare(a.date) || b.id - a.id
  );

  $("count").textContent = `${rows.length} items`;

  const list = $("list");
  list.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No transactions yet.";
    list.append(empty);
    return;
  }

  for (const item of rows) {
    const row = document.createElement("div");
    row.className = "transaction";

    const icon = document.createElement("div");
    icon.className = "transaction-category-icon";
    icon.innerHTML = categoryIcon(item.category);
    icon.setAttribute("aria-hidden", "true");

    const info = document.createElement("div");
    info.className = "transaction-info";

    const title = document.createElement("div");
    title.className = "description";
    title.textContent = item.description;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.category} · ${item.date} · ${item.accountId ? "Account linked" : "Unassigned"}`;

    info.append(title, meta);

    const right = document.createElement("div");
    right.className = "right";

    const amount = document.createElement("div");
    amount.className =
      "amount " +
      (item.type === "income" ? "positive" : "negative");

    setSensitiveText(
      amount,
      (item.type === "income" ? "+" : "−") + money(item.amount)
    );

    const button = document.createElement("button");
    button.className = "delete";
    button.textContent = "Delete";

    button.onclick = async () => {
      if (confirm("Delete this transaction?")) {
        await remove(item.id);
        await refreshAll();
      }
    };

    right.append(amount, button);
    row.append(icon, info, right);
    list.append(row);
  }
}

// BUDGET CALCULATIONS

function budgetId(month, category) {
  return `${category === "GLOBAL" ? "global" : "category"}:${month}:${category}`;
}

async function renderBudgets() {
  const month = $("budgetMonth").value || currentMonth();

  const [transactions, budgets] = await Promise.all([
    all(),
    allBudgets()
  ]);

  const expenses = transactions.filter(item =>
    item.type === "expense" &&
    item.date.startsWith(month)
  );

  const totalSpent = expenses.reduce(
    (sum, item) => sum + item.amount, 0
  );

  const globalRecord = budgets.find(item =>
    item.id === budgetId(month, "GLOBAL")
  );

  const globalLimit = globalRecord ? globalRecord.amount : 0;
  const remaining = globalLimit - totalSpent;

  setSensitiveText($("globalSpent"), money(totalSpent));

  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();

  setSensitiveText(
    $("dailyAverage"),
    money(totalSpent / daysInMonth)
  );

  setSensitiveText($("budgetRemaining"), money(remaining));

  setSensitiveText(
    $("budgetSummary"),
    globalLimit > 0
      ? `${money(totalSpent)} spent of ${money(globalLimit)}`
      : "Set your monthly budget to track your spending."
  );

  const usedPercent = globalLimit > 0
    ? totalSpent / globalLimit * 100
    : 0;

  const remainingPercent = globalLimit > 0
    ? Math.max(0, 100 - usedPercent)
    : 0;

  $("globalProgress").style.width =
    `${Math.min(100, usedPercent)}%`;

  $("budgetUsedPercent").textContent =
    `${usedPercent.toFixed(1)}% used`;

  $("budgetRemainingPercent").textContent =
    `${remainingPercent.toFixed(1)}% remaining`;

  $("globalProgress").classList.toggle(
    "over-budget",
    globalLimit > 0 && totalSpent > globalLimit
  );

  $("budgetRemaining").classList.toggle(
    "over-budget-text",
    globalLimit > 0 && remaining < 0
  );

  setSensitiveInput(
    $("globalBudgetAmount"),
    globalLimit > 0 ? globalLimit : ""
  );

  const categoryRecords = budgets.filter(item =>
    item.month === month && item.category !== "GLOBAL"
  );

  const container = $("categoryBudgetList");
  container.replaceChildren();

  if (!categoryRecords.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      "No category budgets yet. Add your first category budget above.";
    container.append(empty);
  }

  for (const budget of categoryRecords) {
    const spent = expenses
      .filter(item => item.category === budget.category)
      .reduce((sum, item) => sum + item.amount, 0);

    const percent = budget.amount > 0
      ? spent / budget.amount * 100
      : 0;

    const card = document.createElement("div");
    card.className = "budget-card";

    const top = document.createElement("div");
    top.className = "budget-card-top";

    const name = document.createElement("strong");
    name.textContent = budget.category;

    const numbers = document.createElement("span");
    setSensitiveText(
      numbers,
      `${money(spent)} / ${money(budget.amount)}`
    );

    top.append(name, numbers);

    const track = document.createElement("div");
    track.className = "progress-track category-track";

    const fill = document.createElement("div");
    fill.className = "progress-fill";

    if (percent > 100) fill.classList.add("over-budget");
    fill.style.width = `${Math.min(100, percent)}%`;

    track.append(fill);

    const bottom = document.createElement("div");
    bottom.className = "budget-card-bottom";

    const status = document.createElement("span");
    status.textContent = percent > 100
      ? `${(percent - 100).toFixed(1)}% over limit`
      : `${percent.toFixed(1)}% used`;

    const categoryRemaining = document.createElement("span");
    setSensitiveText(
      categoryRemaining,
      `${money(budget.amount - spent)} remaining`
    );

    bottom.append(status, categoryRemaining);

    const actions = document.createElement("div");
    actions.className = "budget-actions";

    const edit = document.createElement("button");
    edit.className = "delete";
    edit.textContent = "Edit";

    edit.onclick = () => {
      $("budgetCategory").value = budget.category;
      setSensitiveInput($("categoryBudgetAmount"), budget.amount);
      $("categoryBudgetAmount").focus();
    };

    const removeButton = document.createElement("button");
    removeButton.className = "delete";
    removeButton.textContent = "Remove";

    removeButton.onclick = async () => {
      if (confirm(`Remove the ${budget.category} budget?`)) {
        await removeBudget(budget.id);
        await renderBudgets();
      }
    };

    actions.append(edit, removeButton);
    card.append(top, track, bottom, actions);
    container.append(card);
  }

  $("budgetMonth").value = month;
}

async function renderAnalytics() {
  const selectedMonth = $("analyticsMonth").value || currentMonth();

  const transactions = await all();

  const monthRows = transactions.filter(item =>
    item.date.startsWith(selectedMonth)
  );

  const income = monthRows
    .filter(item => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const expenses = monthRows
    .filter(item => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const savings = income - expenses;
  const savingsRate = income > 0
    ? (savings / income * 100).toFixed(1) + "%"
    : "—";

  setSensitiveText($("analyticsIncome"), money(income));
  setSensitiveText($("analyticsExpenses"), money(expenses));
  setSensitiveText($("analyticsSavings"), money(savings));
  $("analyticsSavingsRate").textContent = savingsRate;

  // Spending by category
  const categoryTotals = {};

  for (const item of monthRows) {
    if (item.type !== "expense") continue;

    const category = item.category || "Other";
    categoryTotals[category] =
      (categoryTotals[category] || 0) + item.amount;
  }

  const categoryContainer = $("categoryAnalytics");
  categoryContainer.replaceChildren();

  const categories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1]);

  if (!categories.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No spending recorded this month yet.";
    categoryContainer.append(empty);
  }

  const largestCategory = Math.max(
    1,
    ...categories.map(item => item[1])
  );

  for (const [category, amount] of categories) {
    const row = document.createElement("div");
    row.className = "analytics-category";

    const top = document.createElement("div");
    top.className = "analytics-category-top";

    const name = document.createElement("strong");
    name.textContent = category;

    const value = document.createElement("span");
    setSensitiveText(value, money(amount));

    top.append(name, value);

    const track = document.createElement("div");
    track.className = "progress-track analytics-track";

    const fill = document.createElement("div");
    fill.className = "progress-fill analytics-fill";
    fill.style.width =
      `${amount / largestCategory * 100}%`;

    track.append(fill);
    row.append(top, track);
    categoryContainer.append(row);
  }

  // Six-month spending trend, ending at selected month
  const [year, month] = selectedMonth.split("-").map(Number);

  const trendMonths = [];

  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(year, month - 1 - offset, 1);

    const key =
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const label = date.toLocaleDateString("en-ID", {
      month: "short"
    });

    const spent = transactions
      .filter(item =>
        item.type === "expense" &&
        item.date.startsWith(key)
      )
      .reduce((sum, item) => sum + item.amount, 0);

    trendMonths.push({ key, label, spent });
  }

  const trendContainer = $("spendingTrend");
  trendContainer.replaceChildren();

  const highestSpending = Math.max(
    1,
    ...trendMonths.map(item => item.spent)
  );

  for (const item of trendMonths) {
    const column = document.createElement("div");
    column.className = "trend-column";

    const amount = document.createElement("span");
    amount.className = "trend-amount";
    setSensitiveText(amount, money(item.spent));

    const track = document.createElement("div");
    track.className = "trend-bar-track";

    const bar = document.createElement("div");
    bar.className = "trend-bar";

    bar.style.height =
      `${item.spent / highestSpending * 100}%`;

    if (item.key === selectedMonth) {
      bar.classList.add("current-month");
    }

    track.append(bar);

    const label = document.createElement("span");
    label.className = "trend-label";
    label.textContent = item.label;

    column.append(amount, track, label);
    trendContainer.append(column);
  }
}

// SAVE GLOBAL BUDGET

$("globalBudgetForm").onsubmit = async event => {
  event.preventDefault();

  const month = $("budgetMonth").value;
  const amount = Number($("globalBudgetAmount").value);

  if (!month || !Number.isSafeInteger(amount) || amount <= 0) {
    $("globalBudgetStatus").textContent =
      "Please enter a valid monthly budget.";
    return;
  }

  try {
    await saveBudget({
      id: budgetId(month, "GLOBAL"),
      month,
      category: "GLOBAL",
      amount,
      updatedAt: new Date().toISOString()
    });

    $("globalBudgetStatus").textContent =
      "Global budget saved successfully.";

    await renderBudgets();
  } catch (error) {
    console.error(error);
    $("globalBudgetStatus").textContent =
      "Could not save the global budget.";
  }
};

// SAVE CATEGORY BUDGET

$("categoryBudgetForm").onsubmit = async event => {
  event.preventDefault();

  const month = $("budgetMonth").value;
  const category = $("budgetCategory").value;
  const amount = Number($("categoryBudgetAmount").value);

  if (!month || !Number.isSafeInteger(amount) || amount <= 0) {
    $("categoryBudgetStatus").textContent =
      "Please enter a valid category limit.";
    return;
  }

  try {
    await saveBudget({
      id: budgetId(month, category),
      month,
      category,
      amount,
      updatedAt: new Date().toISOString()
    });

    $("categoryBudgetAmount").value = "";

    $("categoryBudgetStatus").textContent =
      `${category} budget saved successfully.`;

    await renderBudgets();
  } catch (error) {
    console.error(error);
    $("categoryBudgetStatus").textContent =
      "Could not save the category budget.";
  }
};

// ACCOUNTS & LEDGER
async function populatePaymentAccountSelect(id) {
  const select = $(id);
  if (!select) return;
  const accounts = (await accountBalances()).filter(a => a.active !== false && a.classification === "asset");
  const previous = select.value;
  select.replaceChildren(new Option("Choose later", ""));
  accounts.forEach(a => select.add(new Option(a.name, a.id)));
  if (accounts.some(a => a.id === previous)) select.value = previous;
}

async function renderAccountSelectors() {
  const accounts = (await accountBalances()).filter(account => account.active !== false);
  const select = $("transactionAccount");
  if (select) {
    const previous = select.value;
    select.replaceChildren(new Option("Unassigned — excluded from account balances", ""));
    accounts.forEach(account => select.add(new Option(account.name, account.id)));
    if (accounts.some(account => account.id === previous)) select.value = previous;
  }
  const from = $("transferFrom"), to = $("transferTo");
  if (from && to) {
    const oldFrom = from.value, oldTo = to.value;
    [from, to].forEach(select => select.replaceChildren(new Option("Choose account", "")));
    accounts.forEach(account => {
      from.add(new Option(`${account.name} (${account.type})`, account.id));
      to.add(new Option(`${account.name} (${account.type})`, account.id));
    });
    from.value = oldFrom; to.value = oldTo;
  }
}

async function renderAccounts() {
  const accounts = await accountBalances();
  const active = accounts.filter(a => a.active !== false);
  const cards = active.filter(a => a.type === "Credit card");
  const otherAssets = active.filter(a => a.type !== "Credit card" && a.classification === "asset");
  const otherLiabilities = active.filter(a => a.type !== "Credit card" && a.classification === "liability");
  const assets = active.filter(a => a.classification === "asset");
  const liabilities = active.filter(a => a.classification === "liability");
  const totalAssets = assets.reduce((s,a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s,a) => s + a.balance, 0);
  setSensitiveText($("totalAssets"), money(totalAssets));
  setSensitiveText($("totalLiabilities"), money(totalLiabilities));
  setSensitiveText($("netWorth"), money(totalAssets-totalLiabilities));
  $("netWorth").classList.toggle("negative-value", totalAssets - totalLiabilities < 0);

  const cardList=$("creditCardList"); cardList.replaceChildren();
  if (!cards.length) { const empty=document.createElement("p"); empty.className="empty"; empty.textContent="No credit cards yet. Add one below to track limit, outstanding balance and available credit."; cardList.append(empty); }
  cards.forEach(account => {
    const limit = Number(account.creditLimit || 0);
    const outstanding = Number(account.balance || 0);
    const available = limit - outstanding;
    const usage = limit > 0 ? Math.max(0, Math.min(100, outstanding / limit * 100)) : 0;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "account-row account-card-interactive credit-account-row";
    card.addEventListener("click", () => openAccountEditor(account));
    card.setAttribute("aria-label", `Open ${account.name} credit card details`);

    const info = document.createElement("div");
    info.className = "account-row-info";
    const name = document.createElement("strong");
    name.textContent = account.name;
    const meta = document.createElement("small");
    meta.textContent = limit > 0
      ? `Credit card · Limit ${money(limit)}`
      : "Credit card · Limit not set";
    info.append(name, meta);

    const valueWrap = document.createElement("div");
    valueWrap.className = "account-row-values";
    const balance = document.createElement("strong");
    balance.className = "account-value";
    setSensitiveText(balance, money(outstanding));
    balance.classList.toggle("negative-value", outstanding < 0);
    const availableLabel = document.createElement("small");
    availableLabel.textContent = limit > 0
      ? `${money(available)} available`
      : "Available credit —";
    valueWrap.append(balance, availableLabel);

    const progress = document.createElement("div");
    progress.className = "account-usage-track";
    const fill = document.createElement("div");
    fill.className = "account-usage-fill";
    fill.style.width = `${usage}%`;
    progress.append(fill);

    card.append(info, valueWrap, progress);
    cardList.append(card);
  });
  const list=$("accountList"); list.replaceChildren();
  if (!otherAssets.length) { const empty=document.createElement("p"); empty.className="empty"; empty.textContent="No accounts yet. Add a bank, cash, savings or investment account below."; list.append(empty); }
  otherAssets.forEach(account=>{
    const row=document.createElement("button"); row.type="button"; row.className="account-row account-card-interactive";
    row.addEventListener("click", () => openAccountEditor(account));
    const info=document.createElement("div"); const name=document.createElement("strong"); name.textContent=account.name;
    const meta=document.createElement("small"); meta.textContent=`${account.type} · ${account.classification==="liability"?"Liability":"Asset"}`; info.append(name,meta);
    const value=document.createElement("strong"); value.className="account-value"; setSensitiveText(value,money(account.balance));
    value.classList.toggle("negative-value", account.balance < 0);
    row.append(info,value);
    list.append(row);
  });
  const liabilityList = $("liabilityList");
  liabilityList.replaceChildren();
  if (!otherLiabilities.length) { const empty=document.createElement("p"); empty.className="empty"; empty.textContent="No loans or other liabilities yet."; liabilityList.append(empty); }
  otherLiabilities.forEach(account => {
    const row=document.createElement("button"); row.type="button"; row.className="account-row account-card-interactive";
    row.addEventListener("click", () => openAccountEditor(account));
    const info=document.createElement("div"); const name=document.createElement("strong"); name.textContent=account.name;
    const meta=document.createElement("small"); meta.textContent=account.type; info.append(name,meta);
    const value=document.createElement("strong"); value.className="account-value"; setSensitiveText(value,money(account.balance));
    row.append(info,value); liabilityList.append(row);
  });
  await renderAccountSelectors();
}

async function openAccountEditor(account) {
  $("editAccountId").value=account.id;
  $("editAccountName").value=account.name;
  $("editAccountType").value=account.type;
  $("editAccountClassification").value=account.classification;
  $("editAccountType").disabled = true;
  $("editAccountClassification").disabled = true;
  const isCard=account.type==="Credit card";
  $("editCreditFields").hidden=!isCard;
  $("editCreditLimit").value=account.creditLimit||"";
  $("editStatementDay").value=account.statementDay||"";
  $("editDueDay").value=account.dueDay||"";
  $("editMinimumPayment").value=account.minimumPayment||0;
  await populatePaymentAccountSelect("editPaymentAccount");
  $("editPaymentAccount").value=account.paymentAccountId||"";
  $("accountEditDialog").showModal();
}
$("closeAccountEdit").onclick=()=>$("accountEditDialog").close();
$("editAccountType").onchange=()=>{
  const type=$("editAccountType").value;
  const isCard=type==="Credit card";
  $("editAccountClassification").value=["Credit card","Personal loan","Mortgage","Other liability"].includes(type)?"liability":"asset";
  $("editCreditFields").hidden=!isCard;
};
$("accountEditForm").onsubmit=async event=>{
  event.preventDefault();
  const id=$("editAccountId").value, accounts=await allAccounts(), old=accounts.find(a=>a.id===id);
  if(!old){$("editAccountStatus").textContent="Account not found.";return;}
  const type=old.type, isCard=type==="Credit card";
  const limit=Number($("editCreditLimit").value||0);
  if(isCard&&(!Number.isSafeInteger(limit)||limit<=0)){$("editAccountStatus").textContent="Enter a valid credit limit.";return;}
  const updated={...old,name:$("editAccountName").value.trim(),type,classification:old.classification,
    creditLimit:isCard?limit:null,statementDay:isCard?(Number($("editStatementDay").value)||null):null,
    dueDay:isCard?(Number($("editDueDay").value)||null):null,minimumPayment:isCard?Number($("editMinimumPayment").value||0):0,
    paymentAccountId:isCard?($("editPaymentAccount").value||null):null,updatedAt:new Date().toISOString()};
  if(!updated.name){$("editAccountStatus").textContent="Enter an account name.";return;}
  await operation("accounts","readwrite",s=>s.put(updated));
  $("accountEditDialog").close(); await refreshAll();
};

$("accountType").addEventListener("change", async () => {
  const liabilityTypes = ["Credit card", "Personal loan", "Mortgage", "Other liability"];
  const isCard = $("accountType").value === "Credit card";
  $("accountClassification").value = liabilityTypes.includes($("accountType").value) ? "liability" : "asset";
  $("creditLimitField").hidden = !isCard;
  $("creditDetailsFields").hidden = !isCard;
  await populatePaymentAccountSelect("paymentAccount");
  $("creditLimit").required = isCard;
  await populatePaymentAccountSelect("paymentAccount");
});

$("accountForm").onsubmit = async event => {
  event.preventDefault();
  const name = $("accountName").value.trim();
  const openingBalance = Number($("openingBalance").value || 0);
  const classification = $("accountClassification").value;
  const type = $("accountType").value;
  if (!name || !Number.isSafeInteger(openingBalance) || openingBalance < 0) {
    $("accountStatus").textContent = "Enter an account name and a valid non-negative opening balance."; return;
  }
  const isCard = type === "Credit card";
  const creditLimit = Number($("creditLimit").value || 0);
  if (isCard && (!Number.isSafeInteger(creditLimit) || creditLimit <= 0)) {
    $("accountStatus").textContent = "Enter a valid credit limit."; return;
  }
  const account = { id:makeId("account"), name, type, classification,
    openingBalance, openingBalanceDate:$("openingDate").value || localDate(),
    creditLimit: isCard ? creditLimit : null,
    statementDay: isCard ? Number($("statementDay").value || 0) || null : null,
    dueDay: isCard ? Number($("dueDay").value || 0) || null : null,
    minimumPayment: isCard ? Number($("minimumPayment").value || 0) : 0,
    paymentAccountId: isCard ? ($("paymentAccount").value || null) : null,
    currency:"IDR", active:true, createdAt:new Date().toISOString() };
  try {
    const openingGroup = makeId("opening");
    const openingSide = classification === "asset" ? "debit" : "credit";
    const openingEntries = openingBalance > 0 ? [
      { id:makeId("je"), groupId:openingGroup, accountId:account.id, systemAccount:null,
        side:openingSide, amount:openingBalance, balanceDelta:0, date:account.openingBalanceDate,
        kind:"opening-balance", createdAt:new Date().toISOString() },
      { id:makeId("je"), groupId:openingGroup, accountId:null, systemAccount:"Opening Balance Equity",
        side:openingSide === "debit" ? "credit" : "debit", amount:openingBalance,
        balanceDelta:0, date:account.openingBalanceDate, kind:"opening-balance",
        createdAt:new Date().toISOString() }
    ] : [];
    await atomicWrite(["accounts", "journalEntries"], tx => {
      tx.objectStore("accounts").add(account);
      openingEntries.forEach(entry => tx.objectStore("journalEntries").add(entry));
    });
    $("accountForm").reset(); $("openingDate").value=localDate();
    $("accountStatus").textContent="Account added. Opening balance is now included in your account totals.";
    await refreshAll();
  } catch(error) { console.error(error); $("accountStatus").textContent="Could not save account."; }
};

$("transferForm").onsubmit = async event => {
  event.preventDefault();
  const fromId=$("transferFrom").value, toId=$("transferTo").value;
  const amount=Number($("transferAmount").value), date=$("transferDate").value;
  const description=$("transferDescription").value.trim() || "Account transfer";
  if (!fromId || !toId || fromId===toId || !Number.isSafeInteger(amount) || amount<=0 || !date) {
    $("transferStatus").textContent="Choose two different accounts and enter a valid amount and date."; return;
  }
  try {
    const accounts=await allAccounts();
    const from=accounts.find(a=>a.id===fromId), to=accounts.find(a=>a.id===toId);
    if (!from || !to || from.active===false || to.active===false) throw new Error("Choose active accounts.");
    if (from.classification!=="asset") throw new Error("Transfers must start from an asset account. Use an asset account to pay a liability.");
    const transfer={id:makeId("transfer"), fromAccountId:fromId,toAccountId:toId,amount,date,description,createdAt:new Date().toISOString()};
    const groupId=makeId("journal");
    const entries=[ledgerEntry(from,amount,"decrease",date,{groupId,transferId:transfer.id,kind:"transfer"}),
      ledgerEntry(to,amount,"increase",date,{groupId,transferId:transfer.id,kind:to.classification==="liability"?"liability-payment":"transfer"})];
    await atomicWrite(["transfers","journalEntries"],tx=>{
      tx.objectStore("transfers").add(transfer);
      entries.forEach(entry=>tx.objectStore("journalEntries").add(entry));
    });
    $("transferForm").reset(); $("transferDate").value=localDate();
    $("transferStatus").textContent="Transfer saved. Account balances updated.";
    await refreshAll();
  } catch(error) { console.error(error); $("transferStatus").textContent=error.message || "Could not save transfer."; }
};

// ADD TRANSACTION

$("category").addEventListener("change", () => {
  $("categoryIconPreview").innerHTML = categoryIcon($("category").value);
});

$("form").onsubmit = async event => {
  event.preventDefault();

  const description = $("description").value.trim();
  const amount = Number($("amount").value);
  const date = $("date").value;

  const type = document.querySelector(
    'input[name="type"]:checked'
  ).value;

  if (
    !description ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    $("status").textContent =
      "Enter a valid description, amount and date.";
    return;
  }

  try {
    const accountId = $("transactionAccount").value || null;
    const transaction = {
      description, amount, date, type, accountId,
      category: $("category").value,
      createdAt: new Date().toISOString()
    };
    if (accountId) {
      const account = (await allAccounts()).find(item => item.id === accountId && item.active !== false);
      if (!account) throw new Error("Choose an active account.");
      if (type === "income" && account.classification !== "asset") throw new Error("Income must be received into an asset account.");
      if (type === "expense" && account.classification === "liability" && account.type !== "Credit card") throw new Error("Only credit card accounts can be selected for an expense.");
      await atomicWrite(["transactions", "journalEntries"], tx => {
        const request = tx.objectStore("transactions").add(transaction);
        request.onsuccess = () => {
          const direction = type === "income" ? "increase" : "decrease";
          const groupId = makeId("journal");
          const entry = ledgerEntry(account, amount, direction, date,
            { groupId, transactionId: request.result, kind: type, category: transaction.category, description });
          const counterpart = {
            id:makeId("je"), groupId, accountId:null,
            systemAccount:type === "income" ? `Income:${transaction.category}` : `Expense:${transaction.category}`,
            side:type === "income" ? "credit" : "debit", amount, balanceDelta:0, date,
            transactionId:request.result, kind:type, category:transaction.category,
            description, createdAt:new Date().toISOString()
          };
          tx.objectStore("journalEntries").add(entry);
          tx.objectStore("journalEntries").add(counterpart);
        };
      });
    } else {
      await add(transaction);
    }

    $("form").reset();
    $("date").value = localDate();

    $("status").textContent =
      "Transaction saved on this device.";

    await refreshAll();
  } catch (error) {
    $("status").textContent =
      "Could not save transaction.";
    console.error(error);
  }
};

// SETTINGS SEGMENTED NAVIGATION
document.querySelectorAll("[data-settings-tab]").forEach(button => {
  button.addEventListener("click", () => {
    const tab = button.dataset.settingsTab;
    document.querySelectorAll("[data-settings-tab]").forEach(item =>
      item.classList.toggle("active", item === button)
    );
    document.querySelectorAll("[data-settings-panel]").forEach(panel => {
      const active = panel.dataset.settingsPanel === tab;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
  });
});

// REFRESH ALL SCREENS

async function refreshAll() {
  await render();
  await renderTransactions();
  await renderAccounts();

  if ($("budgetsScreen").classList.contains("active")) {
    await renderBudgets();
  }

  if ($("homeScreen").classList.contains("active")) {
    await renderAnalytics();
  }
}

// HOME DASHBOARD QUICK ACTIONS
document.querySelectorAll("[data-quick-action]").forEach(button => {
  button.addEventListener("click", () => {
    const type = button.dataset.quickAction;
    const radio = document.querySelector(`input[name="type"][value="${type}"]`);
    if (radio) radio.checked = true;
    showScreen("transactionsScreen");
    $("description").focus({ preventScroll: true });
  });
});
document.querySelectorAll("[data-go-screen]").forEach(button => {
  button.addEventListener("click", () => showScreen(button.dataset.goScreen));
});

// DASHBOARD CONTROLS

$("month").onchange = () =>
  render().catch(console.error);

$("budgetMonth").onchange = () =>
  renderBudgets().catch(console.error);
$("analyticsMonth").onchange = () =>
  renderAnalytics().catch(console.error);
document.querySelectorAll(".period-btn").forEach(button => {
  button.addEventListener("click", () => {
    dashboardPeriod = button.dataset.period;
    render().catch(console.error);
  });
});

// EXPORT ALL TRANSACTIONS

$("export").onclick = async () => {
  const rows = await all();

  const cell = value =>
    '"' + String(value).replaceAll('"', '""') + '"';

  const csv = [
    ["Date", "Type", "Description", "Category", "Amount"]
      .map(cell).join(","),
    ...rows.map(item =>
      [
        item.date,
        item.type,
        item.description,
        item.category,
        item.amount
      ].map(cell).join(",")
    )
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "pocketledger-transactions.csv";

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// START APPLICATION

(async () => {
  try {
    db = await openDB();

    $("date").value = localDate();
    $("openingDate").value = localDate();
    $("transferDate").value = localDate();
    $("month").value = localDate();
    $("budgetMonth").value = currentMonth();
$("analyticsMonth").value = currentMonth();
    await refreshAll();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("./service-worker.js")
        .catch(console.error);
    }
  } catch (error) {
    console.error(error);
    alert(
      "Unable to open local storage. Your existing data has not been intentionally deleted. Check Safari settings."
    );
  }
})();

const $ = id => document.getElementById(id);

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
// Version 2 adds budgets without deleting transactions.

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PocketLedgerDB", 2);

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
  }

  if (screenId === "transactionsScreen") {
    renderTransactions().catch(console.error);
  }
  if (screenId === "analyticsScreen") {
    renderAnalytics().catch(console.error);
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
  const [startDate, endDate] =
    getPeriodRange(selectedDate, dashboardPeriod);

  const rows = (await all())
    .filter(x => x.date >= startDate && x.date <= endDate)
    .sort((a, b) =>
      b.date.localeCompare(a.date) || b.id - a.id
    );

  const income = rows
    .filter(x => x.type === "income")
    .reduce((sum, x) => sum + x.amount, 0);

  const expenses = rows
    .filter(x => x.type === "expense")
    .reduce((sum, x) => sum + x.amount, 0);

  setSensitiveText($("income"), money(income));
  setSensitiveText($("expenses"), money(expenses));
  setSensitiveText($("balance"), money(income - expenses));
  $("count").textContent = `${rows.length} items`;

  $("balanceLabel").textContent =
    `${dashboardPeriod.toUpperCase()} BALANCE`;

  $("dashboardSubtitle").textContent =
    `${dashboardPeriod.charAt(0).toUpperCase() +
    dashboardPeriod.slice(1)} overview · ${
      periodDescription(selectedDate, dashboardPeriod)
    }`;

  document.querySelectorAll(".period-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.period === dashboardPeriod
    );
  });

  const activeDays = new Set(rows.map(x => x.date)).size;

  const insights = [
    ["Transactions", String(rows.length)],
    ["Active days", String(activeDays)],
    [
      "Average daily spending",
      money(activeDays ? expenses / activeDays : 0)
    ],
    [
      "Savings rate",
      income > 0
        ? `${((income - expenses) / income * 100).toFixed(1)}%`
        : "—"
    ]
  ];

  const container = $("periodInsights");
  container.replaceChildren();

  for (const [label, value] of insights) {
    const card = document.createElement("div");
    card.className = "insight-card";

    const title = document.createElement("span");
    title.textContent = label;

    const amount = document.createElement("strong");
    if (label === "Average daily spending") {
      setSensitiveText(amount, value);
    } else {
      amount.textContent = value;
    }

    card.append(title, amount);
    container.append(card);
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

    const info = document.createElement("div");

    const title = document.createElement("div");
    title.className = "description";
    title.textContent = item.description;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.category} · ${item.date}`;

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
    row.append(info, right);
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

// ADD TRANSACTION

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
    await add({
      description,
      amount,
      date,
      type,
      category: $("category").value,
      createdAt: new Date().toISOString()
    });

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

// REFRESH ALL SCREENS

async function refreshAll() {
  await render();
  await renderTransactions();

  if ($("budgetsScreen").classList.contains("active")) {
    await renderBudgets();
  }

  if ($("analyticsScreen").classList.contains("active")) {
    await renderAnalytics();
  }
}

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
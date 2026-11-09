const $ = id => document.getElementById(id);

let toastTimer;
function showToast(message, type = "success") {
  const toast = $("appToast");
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add("visible");
  toast.setAttribute("aria-hidden", "false");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    toast.setAttribute("aria-hidden", "true");
  }, 3200);
}

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
let budgetPeriod = "monthly";

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
    const request = indexedDB.open("PocketLedgerDB", 5);

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
      if (!database.objectStoreNames.contains("savingsGoals")) {
        const goals = database.createObjectStore("savingsGoals", { keyPath: "id" });
        goals.createIndex("byCreatedAt", "createdAt", { unique: false });
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
const allSavingsGoals = () => operation("savingsGoals", "readonly", s => s.getAll());
const makeId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

async function accountBalances() {
  const [accounts, entries] = await Promise.all([allAccounts(), allJournalEntries()]);
  return accounts.map(account => ({
    ...account,
    balance: PocketLedgerCore.calculateAccountBalance(account.openingBalance, entries, account.id)
  }));
}

function ledgerEntry(account, amount, direction, date, details) {
  // balanceDelta is positive when the account's displayed balance increases.
  const balanceDelta = PocketLedgerCore.calculateLedgerBalanceDelta(account.classification, direction, amount);
  return { id: makeId("je"), accountId: account.id, amount,
    side: direction === "increase" ? "debit" : "credit",
    balanceDelta, date, ...details, createdAt: new Date().toISOString() };
}

// DATE HELPERS

function getPeriodRange(date, period) {
  return PocketLedgerCore.getPeriodRange(date, period);
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
    renderGoals().catch(console.error);
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
  if (screenId === "goalsScreen") {
    renderGoals().catch(console.error);
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
  // Archived accounts remain part of net worth; archiving only hides them from daily management.
  const accounts = await accountBalances();
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

async function populateTransactionAccountFilter(){
 const select=$("transactionAccountFilter"),previous=select.value,accounts=(await allAccounts()).filter(account=>account.active!==false);
 select.replaceChildren(new Option("All accounts","all"),new Option("Unassigned","unassigned"));
 accounts.forEach(account=>select.add(new Option(account.name,account.id)));
 if([...select.options].some(option=>option.value===previous))select.value=previous;
}
function transactionFilterRows(rows){
 const query=$("transactionSearch").value.trim().toLocaleLowerCase();
 const type=$("transactionTypeFilter").value,category=$("transactionCategoryFilter").value,account=$("transactionAccountFilter").value;
 const from=$("transactionDateFrom").value,to=$("transactionDateTo").value,sort=$("transactionSort").value;
 let filtered=rows.filter(item=>{
  if(query&&!String(item.description||"").toLocaleLowerCase().includes(query))return false;
  if(type!=="all"&&item.type!==type)return false;
  if(category!=="all"&&(item.category||"Other")!==category)return false;
  if(account==="unassigned"&&item.accountId)return false;
  if(account!=="all"&&account!=="unassigned"&&item.accountId!==account)return false;
  if(from&&item.date<from)return false;
  if(to&&item.date>to)return false;
  return true;
 });
 filtered.sort((a,b)=>{
  if(sort==="oldest")return a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id));
  if(sort==="highest")return b.amount-a.amount||b.date.localeCompare(a.date);
  if(sort==="lowest")return a.amount-b.amount||b.date.localeCompare(a.date);
  return b.date.localeCompare(a.date)||String(b.id).localeCompare(String(a.id));
 });
 return filtered;
}
async function renderTransactions(){
 await populateTransactionAccountFilter();
 const allRows=await all(),rows=transactionFilterRows(allRows);
 $("count").textContent=rows.length===allRows.length?`${rows.length} items`:`${rows.length} of ${allRows.length} items`;
 const list=$("list");list.replaceChildren();
 if(!rows.length){const empty=document.createElement("div");empty.className="empty";empty.textContent=allRows.length?"No transactions match these filters.":"No transactions yet.";list.append(empty);return;}
 for(const item of rows){const row=document.createElement("div");row.className="transaction";const icon=document.createElement("div");icon.className="transaction-category-icon";icon.innerHTML=categoryIcon(item.category);icon.setAttribute("aria-hidden","true");const info=document.createElement("div");info.className="transaction-info";const title=document.createElement("div");title.className="description";title.textContent=item.description;const meta=document.createElement("div");meta.className="meta";meta.textContent=`${item.category||"Other"} · ${item.date} · ${item.accountId?"Account linked":"Unassigned"}${item.recurringRule?" · Recurring":item.recurringSourceId?" · Recurring entry":""}`;info.append(title,meta);
 const right=document.createElement("div");right.className="right";const amount=document.createElement("div");amount.className="amount "+(item.type==="income"?"positive":"negative");setSensitiveText(amount,(item.type==="income"?"+":"−")+money(item.amount));const actions=document.createElement("div");actions.className="transaction-actions";
 const edit=document.createElement("button");edit.className="delete";edit.textContent="Edit";edit.onclick=async()=>{await populateTransactionAccountSelect();$("description").value=item.description;$("amount").value=String(item.amount);$("date").value=item.date;$("category").value=item.category||"Other";$("transactionAccount").value=item.accountId||"";const radio=document.querySelector(`input[name="type"][value="${item.type}"]`);if(radio)radio.checked=true;$("categoryIconPreview").innerHTML=categoryIcon(item.category);$("editingTransactionId").value=String(item.id);$("recurringEnabled").checked=!!item.recurringRule;$("recurringFrequency").value=item.recurringRule?.frequency||"monthly";$("recurringOptions").hidden=!item.recurringRule;$("formSubmitLabel").textContent="Save changes";$("cancelTransactionEdit").hidden=false;$("transactionFormHeading").textContent="Edit transaction";$("status").textContent="Editing an existing transaction. Save changes when finished.";$("form").scrollIntoView({behavior:"smooth",block:"start"});};
 const del=document.createElement("button");del.className="delete";del.textContent="Delete";del.onclick=async()=>{const allRows=await all(),ids=new Set([item.id]);if(item.recurringRule)allRows.filter(x=>x.recurringSourceId===item.id).forEach(x=>ids.add(x.id));if(!confirm(item.recurringRule?"Delete this recurring transaction and all entries generated from it?":"Delete this transaction? Its linked ledger entries will also be removed."))return;await atomicWrite(["transactions","journalEntries"],tx=>{const transactions=tx.objectStore("transactions"),entries=tx.objectStore("journalEntries");ids.forEach(id=>transactions.delete(id));entries.getAll().onsuccess=event=>event.target.result.filter(entry=>ids.has(entry.transactionId)).forEach(entry=>entries.delete(entry.id));});await refreshAll();};
 actions.append(edit,del);right.append(amount,actions);row.append(icon,info,right);list.append(row);}
}
["transactionSearch","transactionTypeFilter","transactionCategoryFilter","transactionAccountFilter","transactionDateFrom","transactionDateTo","transactionSort"].forEach(id=>$(id).addEventListener(id==="transactionSearch"?"input":"change",()=>renderTransactions().catch(console.error)));
$("clearTransactionFilters").addEventListener("click",()=>{["transactionSearch","transactionDateFrom","transactionDateTo"].forEach(id=>$(id).value="");["transactionTypeFilter","transactionCategoryFilter","transactionAccountFilter"].forEach(id=>$(id).value="all");$("transactionSort").value="newest";renderTransactions().catch(console.error);});

// BUDGET CALCULATIONS

function budgetId(month, category) {
  return `${category === "GLOBAL" ? "global" : "category"}:${month}:${category}`;
}

async function renderBudgetPeriodSummary() {
  const transactions = await all();
  const selectedDate = $("budgetDay").value || localDate();
  const selectedYear = Number($("budgetYear").value) || Number(localDate().slice(0,4));
  const [periodStart, periodEnd] = budgetPeriod === "daily"
    ? PocketLedgerCore.getPeriodRange(selectedDate, "daily")
    : PocketLedgerCore.getPeriodRange(`${selectedYear}-01-01`, "yearly");
  const rows = transactions.filter(item =>
    typeof item.date === "string" && item.date >= periodStart && item.date <= periodEnd
  );
  const income = PocketLedgerCore.sumAmounts(rows.filter(item => item.type === "income"));
  const expenses = PocketLedgerCore.sumAmounts(rows.filter(item => item.type === "expense"));
  const summary = $("budgetPeriodSummary"); summary.replaceChildren();
  const cards = budgetPeriod === "daily"
    ? [["Spent today",money(expenses)],["Income today",money(income)],["Net today",money(income-expenses)],["Transactions",String(rows.length)]]
    : [["Annual spending",money(expenses)],["Annual income",money(income)],["Net savings",money(income-expenses)],["Monthly avg. spending",money(expenses/12)]];
  cards.forEach(([label,value]) => { const card=document.createElement("div");card.className="insight-card";const title=document.createElement("span");title.textContent=label;const amount=document.createElement("strong");if(label==="Transactions")amount.textContent=value;else setSensitiveText(amount,value);card.append(title,amount);summary.append(card); });
  const totals = PocketLedgerCore.categoryTotals(rows);
  const list=$("budgetPeriodCategories");list.replaceChildren();const sorted=Object.entries(totals).sort((x,y)=>y[1]-x[1]);
  if(!sorted.length){const empty=document.createElement("p");empty.className="empty";empty.textContent=budgetPeriod==="daily"?"No spending recorded for this day.":"No spending recorded for this year.";list.append(empty);}
  const max=Math.max(1,...sorted.map(x=>x[1]));
  sorted.forEach(([name,amount])=>{const row=document.createElement("div");row.className="analytics-category";const top=document.createElement("div");top.className="analytics-category-top";const label=document.createElement("strong");label.textContent=name;const value=document.createElement("span");setSensitiveText(value,money(amount));top.append(label,value);const track=document.createElement("div");track.className="progress-track analytics-track";const fill=document.createElement("div");fill.className="progress-fill analytics-fill";fill.style.width=(amount/max*100)+"%";track.append(fill);row.append(top,track);list.append(row);});
}
async function renderBudgets() {
  document.querySelectorAll("[data-budget-period]").forEach(button=>button.classList.toggle("active",button.dataset.budgetPeriod===budgetPeriod));
  $("budgetDayControl").hidden=budgetPeriod!=="daily";
  $("budgetMonthControl").hidden=budgetPeriod!=="monthly";
  $("budgetYearControl").hidden=budgetPeriod!=="yearly";
  $("budgetPeriodView").hidden=budgetPeriod==="monthly";
  $("monthlyBudgetView").hidden=budgetPeriod!=="monthly";
  if(budgetPeriod!=="monthly"){await renderBudgetPeriodSummary();return;}
  const requestedMonth = $("budgetMonth").value || currentMonth();
  const month = PocketLedgerCore.isValidMonth(requestedMonth) ? requestedMonth : currentMonth();
  if ($("budgetMonth").value !== month) $("budgetMonth").value = month;

  const [transactions, budgets] = await Promise.all([
    all(),
    allBudgets()
  ]);

  const expenses = PocketLedgerCore.expenseRowsForMonth(transactions, month);
  const totalSpent = PocketLedgerCore.sumAmounts(expenses);

  const globalRecord = budgets.find(item =>
    item.id === budgetId(month, "GLOBAL")
  );

  const globalLimit = globalRecord ? Number(globalRecord.amount) : 0;
  const daysInMonth = PocketLedgerCore.daysInMonth(month);
  const metrics = PocketLedgerCore.calculateBudgetMetrics(totalSpent, globalLimit, daysInMonth);
  const remaining = metrics.remaining;

  setSensitiveText($("globalSpent"), money(totalSpent));
  setSensitiveText($("dailyAverage"), money(metrics.dailyAverage));

  setSensitiveText($("budgetRemaining"), money(remaining));

  setSensitiveText(
    $("budgetSummary"),
    globalLimit > 0
      ? `${money(totalSpent)} spent of ${money(globalLimit)}`
      : "Set your monthly budget to track your spending."
  );

  const usedPercent = metrics.percentUsed;
  const remainingPercent = metrics.remainingPercent;

  $("globalProgress").style.width =
    `${metrics.progressPercent}%`;

  $("budgetUsedPercent").textContent =
    `${usedPercent.toFixed(1)}% used`;

  $("budgetRemainingPercent").textContent =
    `${remainingPercent.toFixed(1)}% remaining`;

  const globalAlert = metrics.warning;
  $("globalProgress").classList.toggle("budget-warning", globalAlert);
  $("globalProgress").classList.toggle("over-budget", metrics.overBudget);
  const globalAlertElement = $("globalBudgetAlert");
  globalAlertElement.textContent = globalAlert
    ? (usedPercent >= 100
        ? `⚠ Monthly budget exceeded by ${(usedPercent - 100).toFixed(1)}%.`
        : `⚠ Budget alert: ${usedPercent.toFixed(1)}% used. You have ${money(Math.max(0, remaining))} left.`)
    : "";
  globalAlertElement.classList.toggle("visible", globalAlert);

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

  const spentByCategory = PocketLedgerCore.categoryTotals(expenses);
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
    const spent = spentByCategory[budget.category] || 0;

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

    if (percent >= 75) fill.classList.add("budget-warning");
    if (percent > 100) fill.classList.add("over-budget");
    fill.style.width = `${Math.min(100, percent)}%`;

    track.append(fill);

    const bottom = document.createElement("div");
    bottom.className = "budget-card-bottom";

    const status = document.createElement("span");
    status.textContent = percent >= 100
      ? `⚠ ${(percent - 100).toFixed(1)}% over limit`
      : percent >= 75
        ? `⚠ Budget alert · ${percent.toFixed(1)}% used`
        : `${percent.toFixed(1)}% used`;
    status.classList.toggle("budget-alert-text", percent >= 75);

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

  const closeout=$("monthlyCloseout");
  if(closeout){closeout.replaceChildren();const [accounts,entries]=await Promise.all([allAccounts(),allJournalEntries()]);const netWorth=accounts.reduce((sum,a)=>{const movement=entries.filter(e=>e.accountId===a.id).reduce((v,e)=>v+Number(e.balanceDelta||0),0),balance=Number(a.openingBalance||0)+movement;return sum+(a.classification==="liability"?-balance:balance);},0);[["Transactions",String(monthRows.length)],["Net cash flow",money(savings)],["Savings rate",savingsRate],["Current net worth",money(netWorth)]].forEach(([label,value])=>{const card=document.createElement("div");card.className="insight-card comparison-card";const name=document.createElement("span");name.textContent=label;const amount=document.createElement("strong");if(label==="Transactions")amount.textContent=value;else setSensitiveText(amount,value);card.append(name,amount);closeout.append(card);});}
  // Previous-month comparison. Missing prior data is shown explicitly.
  const [selectedYear, selectedMonthNumber] = selectedMonth.split("-").map(Number);
  const previousDate = new Date(selectedYear, selectedMonthNumber - 2, 1);
  const previousKey = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
  const previousRows = transactions.filter(item => item.date.startsWith(previousKey));
  const previousIncome = previousRows.filter(item => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const previousExpenses = previousRows.filter(item => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const previousSavings = previousIncome - previousExpenses;
  const comparison = $("monthComparison");
  comparison.replaceChildren();

  const changeLabel = (current, previous) => {
    if (previous === 0) return current === 0 ? "No change" : "No prior data";
    const change = (current - previous) / Math.abs(previous) * 100;
    return `${change > 0 ? "+" : ""}${change.toFixed(1)}% vs last month`;
  };
  const comparisonCards = [
    ["Income", income, previousIncome, false],
    ["Expenses", expenses, previousExpenses, true],
    ["Net savings", savings, previousSavings, false]
  ];
  for (const [label, current, previous, lowerIsBetter] of comparisonCards) {
    const card = document.createElement("div");
    card.className = "insight-card comparison-card";
    const title = document.createElement("span");
    title.textContent = label;
    const value = document.createElement("strong");
    setSensitiveText(value, money(current));
    const change = document.createElement("small");
    change.textContent = changeLabel(current, previous);
    if (previous !== 0) {
      const delta = current - previous;
      if (delta !== 0) change.classList.add((lowerIsBetter ? delta < 0 : delta > 0) ? "comparison-good" : "comparison-caution");
    }
    card.append(title, value, change);
    comparison.append(card);
  }
  const rateCard = document.createElement("div");
  rateCard.className = "insight-card comparison-card";
  const rateTitle = document.createElement("span");
  rateTitle.textContent = "Savings rate";
  const rateValue = document.createElement("strong");
  rateValue.textContent = savingsRate;
  const rateChange = document.createElement("small");
  const previousRate = previousIncome > 0 ? previousSavings / previousIncome * 100 : null;
  const currentRate = income > 0 ? savings / income * 100 : null;
  rateChange.textContent = previousRate === null || currentRate === null
    ? "Not enough income data"
    : `${currentRate - previousRate > 0 ? "+" : ""}${(currentRate - previousRate).toFixed(1)} percentage points`;
  rateCard.append(rateTitle, rateValue, rateChange);
  comparison.append(rateCard);

  const categoryLeader = Object.entries(categoryTotals).sort((a,b) => b[1]-a[1])[0];
  const insight = $("financialInsight");
  if (!monthRows.length) {
    insight.textContent = "No transactions recorded for this month yet.";
  } else if (categoryLeader && previousRows.length && previousExpenses > 0) {
    const expenseChange = (expenses - previousExpenses) / previousExpenses * 100;
    insight.textContent = `${categoryLeader[0]} is your largest spending category at ${money(categoryLeader[1])}. Total expenses are ${Math.abs(expenseChange).toFixed(1)}% ${expenseChange > 0 ? "higher" : expenseChange < 0 ? "lower" : "unchanged"} than last month.`;
  } else if (categoryLeader) {
    insight.textContent = `${categoryLeader[0]} is your largest spending category at ${money(categoryLeader[1])}. More history will unlock month-to-month insights.`;
  } else {
    insight.textContent = "No expenses recorded this month. Keep tracking to build your spending history.";
  }


  // Reconstruct historical month-end net worth from account opening balances and dated ledger entries.
  // Credit limits are intentionally excluded: only each liability account's outstanding balance is counted.
  const [accounts, journalEntries] = await Promise.all([allAccounts(), allJournalEntries()]);
  const netWorthMonths = [];
  for (let offset = 11; offset >= 0; offset--) {
    const monthDate = new Date(selectedYear, selectedMonthNumber - 1 - offset, 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    let cutoff = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
    const today = localDate();
    if (cutoff > today) cutoff = today;
    let assetsAtDate = 0;
    let liabilitiesAtDate = 0;
    for (const account of accounts) {
      const openingDate = account.openingBalanceDate || (account.createdAt || "").slice(0, 10);
      if (!openingDate || openingDate > cutoff) continue;
      const movement = journalEntries
        .filter(entry => entry.accountId === account.id && entry.date >= openingDate && entry.date <= cutoff)
        .reduce((sum, entry) => sum + Number(entry.balanceDelta || 0), 0);
      const balanceAtDate = Number(account.openingBalance || 0) + movement;
      if (account.classification === "asset") assetsAtDate += balanceAtDate;
      else if (account.classification === "liability") liabilitiesAtDate += balanceAtDate;
    }
    netWorthMonths.push({
      key, label: monthDate.toLocaleDateString("en-ID", { month: "short", year: "2-digit" }),
      assets: assetsAtDate, liabilities: liabilitiesAtDate,
      netWorth: assetsAtDate - liabilitiesAtDate
    });
  }
  const netWorthContainer = $("netWorthTrend");
  netWorthContainer.replaceChildren();
  const latestNetWorth = netWorthMonths[netWorthMonths.length - 1];
  const firstNetWorth = netWorthMonths.find(item => item.assets !== 0 || item.liabilities !== 0);
  setSensitiveText($("historicalNetWorthValue"), money(latestNetWorth.netWorth));
  if (firstNetWorth && firstNetWorth.key !== latestNetWorth.key) {
    const change = latestNetWorth.netWorth - firstNetWorth.netWorth;
    const label = change > 0 ? "increased" : change < 0 ? "decreased" : "unchanged";
    setSensitiveText($("historicalNetWorthChange"),
      `${money(Math.abs(change))} ${label} since ${firstNetWorth.label}`);
  } else {
    $("historicalNetWorthChange").textContent = "History starts with your recorded opening balances.";
  }
  const chartValues = netWorthMonths.map(item => item.netWorth);
  const minValue = Math.min(0, ...chartValues);
  const maxValue = Math.max(1, ...chartValues);
  const range = Math.max(1, maxValue - minValue);
  const width = 320, height = 132, left = 8, right = 312, top = 10, bottom = 112;
  const points = netWorthMonths.map((item, index) => ({
    x: left + (right-left) * index / Math.max(1, netWorthMonths.length-1),
    y: bottom - ((item.netWorth-minValue)/range) * (bottom-top)
  }));
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Reconstructed net worth trend over the last twelve months");
  const zeroY = bottom - ((0-minValue)/range) * (bottom-top);
  const baseline = document.createElementNS(svgNS, "line");
  baseline.setAttribute("x1", String(left)); baseline.setAttribute("x2", String(right));
  baseline.setAttribute("y1", String(zeroY)); baseline.setAttribute("y2", String(zeroY));
  baseline.setAttribute("stroke", "#dfe5df"); baseline.setAttribute("stroke-dasharray", "3 4");
  svg.append(baseline);
  if (points.length > 1) {
    const line = document.createElementNS(svgNS, "polyline");
    line.setAttribute("points", points.map(point => `${point.x},${point.y}`).join(" "));
    line.setAttribute("fill", "none"); line.setAttribute("stroke", "#47775a");
    line.setAttribute("stroke-width", "3"); line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.append(line);
  }
  points.forEach((point,index) => {
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", String(point.x)); dot.setAttribute("cy", String(point.y));
    dot.setAttribute("r", index === points.length-1 ? "4" : "2.2");
    dot.setAttribute("fill", "#47775a");
    svg.append(dot);
  });
  netWorthContainer.append(svg);
  const labels = document.createElement("div");
  labels.className = "networth-month-labels";
  [netWorthMonths[0], netWorthMonths[3], netWorthMonths[7], netWorthMonths[11]].forEach(item => {
    const label = document.createElement("span");
    label.textContent = item.label;
    labels.append(label);
  });
  netWorthContainer.append(labels);

  // Six-month income and expense comparison.
  const trendMonths = [];
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(selectedYear, selectedMonthNumber - 1 - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-ID", { month: "short" });
    const rows = transactions.filter(item => item.date.startsWith(key));
    trendMonths.push({
      key, label,
      income: rows.filter(item => item.type === "income").reduce((sum,item) => sum + item.amount,0),
      expenses: rows.filter(item => item.type === "expense").reduce((sum,item) => sum + item.amount,0)
    });
  }
  const trendContainer = $("spendingTrend");
  trendContainer.replaceChildren();
  const maxFlow = Math.max(1, ...trendMonths.flatMap(item => [item.income, item.expenses]));
  for (const item of trendMonths) {
    const row = document.createElement("div");
    row.className = "cashflow-month";
    const label = document.createElement("strong");
    label.className = "cashflow-month-label";
    label.textContent = item.label;
    const bars = document.createElement("div");
    bars.className = "cashflow-bars";
    for (const [kind, amount] of [["income", item.income], ["expense", item.expenses]]) {
      const line = document.createElement("div");
      line.className = "cashflow-line";
      const value = document.createElement("span");
      value.className = "cashflow-value";
      setSensitiveText(value, money(amount));
      const track = document.createElement("div");
      track.className = "cashflow-track";
      const fill = document.createElement("div");
      fill.className = `cashflow-fill ${kind}`;
      fill.style.width = `${amount / maxFlow * 100}%`;
      track.append(fill);
      line.append(value, track);
      bars.append(line);
    }
    if (item.key === selectedMonth) row.classList.add("current");
    row.append(label, bars);
    trendContainer.append(row);
  }
}

// SAVE GLOBAL BUDGET

$("globalBudgetForm").onsubmit = async event => {
  event.preventDefault();

  const month = $("budgetMonth").value;
  const amount = Number($("globalBudgetAmount").value);

  if (!PocketLedgerCore.isValidMonth(month) || !Number.isSafeInteger(amount) || amount <= 0) {
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

  if (!PocketLedgerCore.isValidMonth(month) || !Number.isSafeInteger(amount) || amount <= 0) {
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
  // Account summaries include archived balances so archiving cannot alter net worth.
  const allAssets = accounts.filter(a => a.classification === "asset");
  const allLiabilities = accounts.filter(a => a.classification === "liability");
  const cards = active.filter(a => a.type === "Credit card");
  const otherAssets = active.filter(a => a.type !== "Credit card" && a.classification === "asset");
  const otherLiabilities = active.filter(a => a.type !== "Credit card" && a.classification === "liability");
  const totalAssets = allAssets.reduce((s,a) => s + a.balance, 0);
  const totalLiabilities = allLiabilities.reduce((s,a) => s + a.balance, 0);
  setSensitiveText($("totalAssets"), money(totalAssets));
  setSensitiveText($("totalLiabilities"), money(totalLiabilities));
  setSensitiveText($("netWorth"), money(totalAssets-totalLiabilities));
  $("netWorth").classList.toggle("negative-value", totalAssets - totalLiabilities < 0);

  const cardList=$("creditCardList"); cardList.replaceChildren();
  if (!cards.length) { const empty=document.createElement("p"); empty.className="empty"; empty.textContent="No credit cards yet. Add one below to track limit, outstanding balance and available credit."; cardList.append(empty); }
  cards.forEach(account => {
    const credit = PocketLedgerCore.calculateCreditMetrics(account.creditLimit, account.balance);
    const { limit, outstanding, availableCredit: available, progressPercent: usage } = credit;

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
  const archived = accounts.filter(account => account.active === false)
    .sort((left, right) => String(right.archivedAt || "").localeCompare(String(left.archivedAt || "")));
  const archiveList = $("archivedAccountList");
  const archiveCount = $("archivedAccountCount");
  archiveList.replaceChildren();
  archiveCount.textContent = String(archived.length);
  if (!archived.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No archived accounts.";
    archiveList.append(empty);
  }
  archived.forEach(account => {
    const row = document.createElement("div");
    row.className = "archived-account-row";
    const info = document.createElement("div");
    info.className = "archived-account-info";
    const name = document.createElement("strong");
    name.textContent = account.name;
    const meta = document.createElement("small");
    meta.textContent = `${account.type} · ${account.classification === "liability" ? "Liability" : "Asset"} · Archived`;
    info.append(name, meta);
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "restore-account-button";
    restore.textContent = "Restore";
    restore.setAttribute("aria-label", `Restore ${account.name}`);
    restore.addEventListener("click", () => restoreArchivedAccount(account.id));
    row.append(info, restore);
    archiveList.append(row);
  });
  await renderAccountSelectors();
}

async function restoreArchivedAccount(accountId) {
  const accounts = await allAccounts();
  const account = accounts.find(item => item.id === accountId && item.active === false);
  if (!account) {
    showToast("Archived account not found.", "error");
    return;
  }
  try {
    const tx = db.transaction("accounts", "readwrite");
    const store = tx.objectStore("accounts");
    account.active = true;
    delete account.archivedAt;
    account.restoredAt = new Date().toISOString();
    store.put(account);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Restore failed."));
      tx.onabort = () => reject(tx.error || new Error("Restore was cancelled."));
    });
    await refreshAll();
    showToast(`${account.name} restored successfully.`);
  } catch (error) {
    console.error("Account restore failed:", error);
    showToast("Could not restore account.", "error");
  }
}

function confirmArchiveAccount(accountName) {
  const dialog = $("archiveConfirmDialog");
  $("archiveConfirmName").textContent = accountName;
  return new Promise(resolve => {
    const finish = value => {
      dialog.dataset.confirmed = String(value);
      dialog.close();
    };
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.dataset.confirmed === "true");
      delete dialog.dataset.confirmed;
    };
    dialog.addEventListener("close", onClose);
    $("cancelArchive").onclick = () => finish(false);
    $("confirmArchive").onclick = () => finish(true);
    dialog.showModal();
  });
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
$("deleteAccount").onclick = async () => {
  const id = $("editAccountId").value;
  const accounts = await allAccounts();
  const account = accounts.find(item => item.id === id);
  if (!account) {
    $("editAccountStatus").textContent = "Account not found.";
    showToast("Account not found.", "error");
    return;
  }
  const confirmed = await confirmArchiveAccount(account.name);
  if (!confirmed) return;

  try {
    const tx = db.transaction("accounts", "readwrite");
    const store = tx.objectStore("accounts");
    account.active = false;
    account.archivedAt = new Date().toISOString();
    store.put(account);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Account archive failed."));
      tx.onabort = () => reject(tx.error || new Error("Account archive was cancelled."));
    });
  } catch (error) {
    console.error("Account archive database error:", error);
    $("editAccountStatus").textContent = error.message || "Could not archive account.";
    showToast("Account could not be archived.", "error");
    return;
  }

  $("accountEditDialog").close();
  showToast("Account archived. Its history is preserved.");
  try {
    await refreshAll();
  } catch (error) {
    console.error("Account archived, but screen refresh failed:", error);
    showToast("Account archived. Refresh the page to update the list.", "error");
  }
};
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
  $("creditLimit").disabled = !isCard;
  $("creditDetailsFields").hidden = !isCard;
  $("openingBalanceLabel").textContent = isCard ? "Current outstanding balance (IDR)" : "Opening balance (IDR)";
  $("openingBalanceHint").textContent = isCard
    ? "Enter only what you currently owe on this card—not its credit limit. Net worth deducts this outstanding balance only."
    : "Enter the account balance on the opening date.";
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
    showToast("Account added successfully.");
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
    if(!PocketLedgerCore.isValidDate(date)||!Number.isSafeInteger(amount)||amount<=0)throw Error("Enter a valid transfer date and positive whole-IDR amount.");
    const oldTransfers=await allTransfers(),duplicate=oldTransfers.some(x=>x.fromAccountId===fromId&&x.toAccountId===toId&&x.amount===amount&&x.date===date&&String(x.description||"")===description);
    if(duplicate&&!confirm("An identical transfer already exists. Save another one anyway?"))return;
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
    showToast("Transfer saved.");
    await refreshAll();
  } catch(error) { console.error(error); $("transferStatus").textContent=error.message || "Could not save transfer."; }
};

// ADD TRANSACTION

$("category").addEventListener("change", () => {
  $("categoryIconPreview").innerHTML = categoryIcon($("category").value);
});

function validLedgerDate(value){return PocketLedgerCore.isValidDate(value);}
function makeTransactionLedgerRows(t,account,id){if(!account)return[];const direction=t.type==="income"?"increase":"decrease",groupId=makeId("journal");const entry=ledgerEntry(account,t.amount,direction,t.date,{groupId,transactionId:id,kind:t.type,category:t.category,description:t.description});const counterpart={id:makeId("je"),groupId,accountId:null,systemAccount:t.type==="income"?`Income:${t.category}`:`Expense:${t.category}`,side:t.type==="income"?"credit":"debit",amount:t.amount,balanceDelta:0,date:t.date,transactionId:id,kind:t.type,category:t.category,description:t.description,createdAt:new Date().toISOString()};return[entry,counterpart];}
async function populateTransactionAccountSelect(){const select=$("transactionAccount"),previous=select.value,accounts=(await allAccounts()).filter(a=>a.active!==false);select.replaceChildren(new Option("Unassigned — excluded from account balances",""));accounts.forEach(a=>select.add(new Option(a.name,a.id)));if(accounts.some(a=>a.id===previous))select.value=previous;}
function resetTransactionEditor(){$("form").reset();$("date").value=localDate();$("editingTransactionId").value="";$("recurringOptions").hidden=true;$("recurringEnabled").checked=false;$("formSubmitLabel").textContent="Add transaction";$("cancelTransactionEdit").hidden=true;$("transactionFormHeading").textContent="New transaction";$("categoryIconPreview").innerHTML=categoryIcon($("category").value);}
$("recurringEnabled").addEventListener("change",()=>{$("recurringOptions").hidden=!$("recurringEnabled").checked;});$("cancelTransactionEdit").addEventListener("click",()=>{resetTransactionEditor();$("status").textContent="Edit cancelled.";});$("category").addEventListener("change",()=>{$("categoryIconPreview").innerHTML=categoryIcon($("category").value);});
$("form").onsubmit=async event=>{event.preventDefault();const description=$("description").value.trim(),amount=Number($("amount").value),date=$("date").value,type=document.querySelector('input[name="type"]:checked')?.value,editingId=$("editingTransactionId").value;
 if(!description||description.length>80||!Number.isSafeInteger(amount)||amount<=0||!validLedgerDate(date)||!["income","expense"].includes(type)){$("status").textContent="Enter a description, a positive whole-IDR amount, and a valid date.";return;}
 try{const accountId=$("transactionAccount").value||null,accounts=await allAccounts(),account=accountId?accounts.find(a=>a.id===accountId&&a.active!==false):null;if(accountId&&!account)throw Error("Choose an active account.");if(account&&type==="income"&&account.classification!=="asset")throw Error("Income must be received into an asset account.");if(account&&type==="expense"&&account.classification==="liability"&&account.type!=="Credit card")throw Error("Only credit card accounts can be selected for an expense.");
 const existing=editingId?(await all()).find(x=>String(x.id)===editingId):null;if(editingId&&!existing)throw Error("This transaction no longer exists. Refresh and try again.");if(existing?.recurringSourceId)throw Error("Edit the original recurring transaction to change its schedule.");
 const t={...(existing||{}),description,amount,date,type,accountId,category:$("category").value||"Other",createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 if($("recurringEnabled").checked){const frequency=$("recurringFrequency").value;if(!["weekly","monthly","yearly"].includes(frequency))throw Error("Choose a valid recurring frequency.");t.recurringRule={frequency,nextDate:existing?.recurringRule?.frequency===frequency?existing.recurringRule.nextDate:nextRecurringDate(date,frequency),active:true};}else if(existing?.recurringRule)t.recurringRule={...existing.recurringRule,active:false};
 const prior=await all(),duplicates=prior.filter(x=>String(x.id)!==editingId&&x.date===date&&x.type===type&&x.amount===amount&&x.description.toLowerCase()===description.toLowerCase()&&(x.accountId||null)===accountId);if(duplicates.length&&!confirm("A very similar transaction already exists on this date. Save another one anyway?"))return;
 if(existing){await atomicWrite(["transactions","journalEntries"],tx=>{tx.objectStore("transactions").put(t);const entries=tx.objectStore("journalEntries");entries.getAll().onsuccess=e=>{e.target.result.filter(x=>x.transactionId===existing.id).forEach(x=>entries.delete(x.id));makeTransactionLedgerRows(t,account,existing.id).forEach(x=>entries.put(x));};});showToast("Transaction updated.");}
 else{await atomicWrite(["transactions","journalEntries"],tx=>{const req=tx.objectStore("transactions").add(t);req.onsuccess=()=>makeTransactionLedgerRows(t,account,req.result).forEach(x=>tx.objectStore("journalEntries").add(x));});showToast("Transaction saved on this device.");}
 resetTransactionEditor();$("status").textContent="Transaction saved on this device.";await refreshAll();
 }catch(error){console.error(error);$("status").textContent=error.message||"Could not save transaction.";showToast(error.message||"Could not save transaction.","error");}};
// iOS Safari: dismiss the keyboard after a form is submitted.
document.addEventListener("submit", event => {
  const active = document.activeElement;
  if (active && event.target instanceof HTMLFormElement && event.target.contains(active)
      && active.matches("input, select, textarea")) {
    active.blur();
  }
}, true);


// LANGUAGE SUPPORT — preference is local to this browser and does not touch financial records.
const LANGUAGE_KEY = "pocketledgerLanguage";
let appLanguage = "en";
const ID_TRANSLATIONS = {
  "Type":"Jenis","Category":"Kategori","Account":"Akun","Search transactions":"Cari transaksi","Search description":"Cari deskripsi","All types":"Semua jenis","All categories":"Semua kategori","All accounts":"Semua akun","Unassigned":"Belum ditautkan","Sort by":"Urutkan","Newest first":"Terbaru","Oldest first":"Terlama","Highest amount":"Nominal tertinggi","Lowest amount":"Nominal terendah","From":"Dari tanggal","To":"Sampai tanggal","Clear filters":"Hapus filter","No transactions match these filters.":"Tidak ada transaksi yang cocok dengan filter.",
  "PERSONAL FINANCE":"KEUANGAN PRIBADI","Overview":"Ringkasan","Daily":"Harian","Monthly":"Bulanan","Yearly":"Tahunan",
  "Hide":"Sembunyikan","Show":"Tampilkan","Income":"Pemasukan","Expenses":"Pengeluaran","Add expense":"Tambah pengeluaran",
  "Record spending":"Catat pengeluaran","Add income":"Tambah pemasukan","Record money in":"Catat pemasukan",
  "Account snapshot":"Ringkasan akun","Manage accounts":"Kelola akun","NET WORTH":"KEKAYAAN BERSIH",
  "Assets minus liabilities":"Aset dikurangi kewajiban","Total assets":"Total aset","Total liabilities":"Total kewajiban",
  "Recent activity":"Aktivitas terbaru","See all":"Lihat semua","Your recent transactions will appear here.":"Transaksi terbaru Anda akan muncul di sini.",
  "Period insights":"Ringkasan periode","Financial insights":"Wawasan keuangan","Monthly closeout":"Ringkasan akhir bulan",
  "A quick summary of the selected month. Transfers are excluded from income and expenses.":"Ringkasan singkat bulan yang dipilih. Transfer tidak dihitung sebagai pemasukan atau pengeluaran.",
  "Income vs. expenses":"Pemasukan vs. pengeluaran","Total income":"Total pemasukan","Total expenses":"Total pengeluaran",
  "Net savings":"Tabungan bersih","Savings rate":"Rasio tabungan","Compared with previous month":"Dibandingkan bulan sebelumnya",
  "Spending by category":"Pengeluaran berdasarkan kategori","Six-month cash flow":"Arus kas enam bulan",
  "Net worth over time":"Perkembangan kekayaan bersih","Latest recorded net worth":"Kekayaan bersih terakhir yang tercatat",
  "Build your history by tracking account balances.":"Bangun riwayat dengan mencatat saldo akun.",
  "Reconstructed from account opening balances and dated ledger activity. Updating a past transaction or opening balance can restate historical values. Credit limits are never counted as debt; only outstanding liabilities are deducted.":"Dihitung dari saldo awal akun dan aktivitas buku besar berdasarkan tanggal. Perubahan transaksi lama atau saldo awal dapat mengubah riwayat. Limit kredit tidak dihitung sebagai utang; hanya kewajiban terutang yang dikurangkan.",
  "Budget":"Anggaran","Plan · Save · Stay on track":"Rencanakan · Menabung · Tetap terarah",
  "To add or edit your spending limits, select":"Untuk menambah atau mengubah batas pengeluaran, pilih",
  "Daily overview":"Ringkasan harian","Monthly overview":"Ringkasan bulanan","TOTAL BUDGET REMAINING":"SISA TOTAL ANGGARAN",
  "Set your monthly budget to get started.":"Atur anggaran bulanan untuk memulai.",
  "Set your monthly budget to track your spending.":"Atur anggaran bulanan untuk memantau pengeluaran.",
  "0% used":"0% terpakai","0% remaining":"0% tersisa","Overall spending":"Total pengeluaran",
  "Spent this month":"Pengeluaran bulan ini","Daily average":"Rata-rata harian","Monthly budget":"Anggaran bulanan",
  "Total monthly budget (IDR)":"Total anggaran bulanan (IDR)","Save global budget":"Simpan anggaran keseluruhan",
  "Category budgets":"Anggaran kategori","Category":"Kategori","Monthly limit (IDR)":"Batas bulanan (IDR)",
  "Save category budget":"Simpan anggaran kategori","Savings goals":"Target tabungan","Create a savings goal":"Buat target tabungan",
  "Goal name":"Nama target","Target amount (IDR)":"Jumlah target (IDR)","Already saved (IDR)":"Sudah ditabung (IDR)",
  "Target date":"Tanggal target","Create savings goal":"Buat target tabungan","Debt overview":"Ringkasan utang",
  "Outstanding balances":"Saldo terutang","Manage accounts & repayments":"Kelola akun & pembayaran",
  "Edit account":"Edit akun","Close":"Tutup","Account name":"Nama akun","Account type":"Jenis akun",
  "Classification":"Klasifikasi","Credit limit (IDR)":"Limit kredit (IDR)","Statement day":"Tanggal cetak tagihan",
  "Payment due day":"Tanggal jatuh tempo","Minimum payment (IDR)":"Pembayaran minimum (IDR)",
  "Repayment account":"Akun pembayaran","Choose later":"Pilih nanti","Opening balance (IDR)":"Saldo awal (IDR)",
  "Opening balance date":"Tanggal saldo awal","Save changes":"Simpan perubahan","Delete account":"Hapus akun",
  "New transaction":"Transaksi baru","Expense":"Pengeluaran","Description":"Deskripsi","Groceries":"Belanja kebutuhan",
  "Amount (IDR)":"Jumlah (IDR)","Date":"Tanggal","Pay from / deposit to":"Bayar dari / setorkan ke",
  "Unassigned — excluded from account balances":"Belum ditetapkan — tidak dihitung dalam saldo akun",
  "Repeat this transaction":"Ulangi transaksi ini","Repeat frequency":"Frekuensi pengulangan",
  "Every week":"Setiap minggu","Every month":"Setiap bulan","Every year":"Setiap tahun",
  "Entries are created on this device when you open PocketLedger. Nothing runs in the background while Safari is closed.":"Entri dibuat di perangkat ini saat Anda membuka PocketLedger. Tidak ada proses berjalan di latar belakang saat Safari ditutup.",
  "Add transaction":"Tambah transaksi","Cancel editing":"Batalkan pengeditan","Transactions":"Transaksi",
  "Home":"Beranda","Budgets":"Anggaran","Settings":"Pengaturan","Private · Local-first":"Privat · Utamakan penyimpanan lokal",
  "Financial accounts":"Akun keuangan","IDR · Local only":"IDR · Hanya lokal","Accounts":"Akun","Credit cards":"Kartu kredit","Liabilities":"Kewajiban",
  "Your bank, cash, savings and investment accounts.":"Akun bank, uang tunai, tabungan, dan investasi Anda.",
  "Add account":"Tambah akun","BCA Main Account":"Akun Utama BCA","Bank":"Bank","Cash":"Tunai",
  "E-wallet":"Dompet digital","Savings":"Tabungan","Investment":"Investasi","Property":"Properti","Vehicle":"Kendaraan",
  "Personal loan":"Pinjaman pribadi","Mortgage":"Hipotek","Other liability":"Kewajiban lain","Asset":"Aset","Liability":"Kewajiban",
  "Enter credit limit":"Masukkan limit kredit","Choose account":"Pilih akun","Note":"Catatan",
  "Transfer between accounts":"Transfer antar akun",
  "Transfers do not count as income or expenses. Paying a credit card reduces its outstanding liability.":"Transfer tidak dihitung sebagai pemasukan atau pengeluaran. Pembayaran kartu kredit mengurangi kewajiban terutang.",
  "From account":"Dari akun","To account":"Ke akun","Monthly card payment":"Pembayaran kartu bulanan","Save transfer":"Simpan transfer",
  "Credit limits are purchasing capacity, not assets. Outstanding balances remain included in total liabilities and net worth.":"Limit kredit adalah kapasitas belanja, bukan aset. Saldo terutang tetap termasuk dalam total kewajiban dan kekayaan bersih.",
  "Loan, mortgage and other liability balances are included in total liabilities and net worth.":"Saldo pinjaman, hipotek, dan kewajiban lainnya termasuk dalam total kewajiban dan kekayaan bersih.",
  "Archived accounts":"Akun yang diarsipkan",
  "Archived accounts are hidden from active lists and transfers. Restore one to use it again; its original ledger history stays intact.":"Akun yang diarsipkan disembunyikan dari daftar aktif dan transfer. Pulihkan untuk menggunakannya kembali; riwayat transaksinya tetap tersimpan.",
  "Export data":"Ekspor data","Download your transactions as a CSV file for spreadsheets and reporting.":"Unduh transaksi dalam format CSV untuk spreadsheet dan pelaporan.",
  "Export CSV":"Ekspor CSV","Secure backup":"Cadangan aman","Backup password":"Kata sandi cadangan",
  "At least 12 characters":"Minimal 12 karakter","Use a strong password you can remember. PocketLedger cannot recover it if you lose it.":"Gunakan kata sandi kuat yang mudah Anda ingat. PocketLedger tidak dapat memulihkannya jika hilang.",
  "Create encrypted backup":"Buat cadangan terenkripsi","Restore from backup file":"Pulihkan dari file cadangan",
  "Reset test data":"Atur ulang data uji","Reset all PocketLedger data":"Hapus semua data PocketLedger",
  "Your financial records stay on this device. No account or sign-in is required.":"Catatan keuangan Anda tersimpan di perangkat ini. Tidak diperlukan akun atau proses masuk.",
  "Language / Bahasa":"Bahasa","Choose the language used throughout PocketLedger.":"Pilih bahasa yang digunakan di seluruh PocketLedger.",
  "App language":"Bahasa aplikasi","English":"Inggris","Apply language":"Terapkan bahasa",
  "Terms & Conditions":"Syarat & Ketentuan","View Terms & Conditions":"Lihat Syarat & Ketentuan",
  "Please read these terms before using PocketLedger.":"Harap baca syarat berikut sebelum menggunakan PocketLedger.",
  "No transactions yet.":"Belum ada transaksi.","No transactions yet. Add your first expense or income to get started.":"Belum ada transaksi. Tambahkan pengeluaran atau pemasukan pertama Anda untuk memulai.",
  "No category budgets yet. Add your first category budget above.":"Belum ada anggaran kategori. Tambahkan anggaran kategori pertama Anda di atas.",
  "No spending recorded for this day.":"Belum ada pengeluaran yang tercatat pada hari ini.",
  "No spending recorded for this year.":"Belum ada pengeluaran yang tercatat pada tahun ini.",
  "No spending recorded this month yet.":"Belum ada pengeluaran yang tercatat bulan ini.",
  "No transactions recorded for this month yet.":"Belum ada transaksi yang tercatat bulan ini.",
  "No archived accounts.":"Tidak ada akun yang diarsipkan.","Restore":"Pulihkan","Edit":"Edit","Delete":"Hapus","Remove":"Hapus",
  "Account linked":"Terhubung ke akun","Unassigned":"Belum ditetapkan","Recurring":"Berulang","Recurring entry":"Entri berulang",
  "Spent today":"Pengeluaran hari ini","Income today":"Pemasukan hari ini","Net today":"Neto hari ini",
  "Annual spending":"Pengeluaran tahunan","Annual income":"Pemasukan tahunan","Net savings":"Tabungan bersih",
  "Monthly avg. spending":"Rata-rata pengeluaran bulanan","Net cash flow":"Arus kas bersih",
  "Current net worth":"Kekayaan bersih saat ini","No change":"Tidak ada perubahan","No prior data":"Belum ada data sebelumnya",
  "Not enough income data":"Data pemasukan belum cukup","No expenses recorded this month. Keep tracking to build your spending history.":"Belum ada pengeluaran bulan ini. Terus catat untuk membangun riwayat pengeluaran.",
  "History starts with your recorded opening balances.":"Riwayat dimulai dari saldo awal yang Anda catat.",
  "No target date":"Tidak ada tanggal target","Goal reached":"Target tercapai","Add savings":"Tambah tabungan",
  "Your savings goals will appear here. Start with an emergency fund or a future purchase.":"Target tabungan Anda akan muncul di sini. Mulailah dengan dana darurat atau rencana pembelian.",
  "No active debts recorded. Add a credit card, loan or other liability in Settings to track it here.":"Belum ada utang aktif. Tambahkan kartu kredit, pinjaman, atau kewajiban lain di Pengaturan untuk memantaunya.",
  "Total outstanding debt":"Total utang terutang",
  "Hide financial amounts":"Sembunyikan nominal keuangan","Show financial amounts":"Tampilkan nominal keuangan",
  "Could not save language preference.":"Tidak dapat menyimpan preferensi bahasa.",
  "Transfer saved. Account balances updated.":"Transfer tersimpan. Saldo akun telah diperbarui.",
  "Transfer saved.":"Transfer tersimpan.","Could not save transfer.":"Tidak dapat menyimpan transfer.",
  "Edit cancelled.":"Pengeditan dibatalkan.","Enter a description, a positive whole-IDR amount, and a valid date.":"Masukkan deskripsi, jumlah IDR bilangan bulat positif, dan tanggal yang valid.",
  "Choose an active account.":"Pilih akun yang aktif.","Income must be received into an asset account.":"Pemasukan harus diterima ke akun aset.",
  "Only credit card accounts can be selected for an expense.":"Hanya akun kartu kredit yang dapat dipilih untuk pengeluaran.",
  "This transaction no longer exists. Refresh and try again.":"Transaksi ini sudah tidak tersedia. Muat ulang dan coba lagi.",
  "Edit the original recurring transaction to change its schedule.":"Edit transaksi berulang asli untuk mengubah jadwalnya.",
  "Choose a valid recurring frequency.":"Pilih frekuensi pengulangan yang valid.",
  "A very similar transaction already exists on this date. Save another one anyway?":"Transaksi yang sangat mirip sudah ada pada tanggal ini. Tetap simpan transaksi lain?",
  "Transaction updated.":"Transaksi diperbarui.","Transaction saved on this device.":"Transaksi tersimpan di perangkat ini.",
  "Could not save transaction.":"Tidak dapat menyimpan transaksi.","Please enter a valid monthly budget.":"Masukkan anggaran bulanan yang valid.",
  "Global budget saved successfully.":"Anggaran keseluruhan berhasil disimpan.","Could not save the global budget.":"Tidak dapat menyimpan anggaran keseluruhan.",
  "Please enter a valid category limit.":"Masukkan batas kategori yang valid.","Could not save the category budget.":"Tidak dapat menyimpan anggaran kategori.",
  "Enter a valid positive amount.":"Masukkan jumlah positif yang valid.","That amount is too large to record safely.":"Jumlah tersebut terlalu besar untuk dicatat dengan aman.",
  "Savings progress updated.":"Progres tabungan diperbarui.","Savings goal archived.":"Target tabungan diarsipkan.",
  "Enter a goal name, a valid target and a non-negative saved amount.":"Masukkan nama target, jumlah target yang valid, dan jumlah tabungan yang tidak negatif.",
  "Already saved cannot exceed the target amount.":"Jumlah yang sudah ditabung tidak boleh melebihi jumlah target.",
  "Savings goal saved on this device.":"Target tabungan tersimpan di perangkat ini.","Savings goal created.":"Target tabungan dibuat.",
  "Could not save this goal.":"Tidak dapat menyimpan target ini.","Account not found.":"Akun tidak ditemukan.",
  "Account archived. Its history is preserved.":"Akun diarsipkan. Riwayatnya tetap tersimpan.",
  "Account added successfully.":"Akun berhasil ditambahkan.","Could not save account.":"Tidak dapat menyimpan akun.",
  "Enter an account name.":"Masukkan nama akun.","Enter a valid credit limit.":"Masukkan limit kredit yang valid.",
  "Enter an account name and a valid non-negative opening balance.":"Masukkan nama akun dan saldo awal non-negatif yang valid.",
  "Account added. Opening balance is now included in your account totals.":"Akun ditambahkan. Saldo awal kini termasuk dalam total akun Anda.",
  "Choose two different accounts and enter a valid amount and date.":"Pilih dua akun yang berbeda dan masukkan jumlah serta tanggal yang valid.",
  "Choose active accounts.":"Pilih akun yang aktif.","Transfers must start from an asset account. Use an asset account to pay a liability.":"Transfer harus berasal dari akun aset. Gunakan akun aset untuk membayar kewajiban.",
  "Enter a valid transfer date and positive whole-IDR amount.":"Masukkan tanggal transfer yang valid dan jumlah IDR bilangan bulat positif.",
  "An identical transfer already exists. Save another one anyway?":"Transfer yang sama sudah ada. Tetap simpan transfer lain?",
  "Account transfer":"Transfer akun","Account archived, but screen refresh failed:":"Akun diarsipkan, tetapi layar gagal diperbarui:",
  "Account archived. Refresh the page to update the list.":"Akun diarsipkan. Muat ulang halaman untuk memperbarui daftar.",
  "Could not restore account.":"Tidak dapat memulihkan akun.","Restore failed.":"Pemulihan gagal.",
  "Restore was cancelled.":"Pemulihan dibatalkan.","Account restore failed:":"Pemulihan akun gagal:",
  "Account archive failed.":"Pengarsipan akun gagal.","Account archive was cancelled.":"Pengarsipan akun dibatalkan.",
  "Could not archive account.":"Tidak dapat mengarsipkan akun.","Account could not be archived.":"Akun tidak dapat diarsipkan.",
  "Account archive database error:":"Kesalahan database saat mengarsipkan akun:",
  "Enter only what you currently owe on this card—not its credit limit. Net worth deducts this outstanding balance only.":"Masukkan hanya jumlah tagihan kartu saat ini—bukan limit kredit. Kekayaan bersih hanya mengurangi saldo terutang ini.",
  "Enter the account balance on the opening date.":"Masukkan saldo akun pada tanggal saldo awal.",
  "Type":"Jenis","Category":"Kategori","Amount":"Jumlah","CSV export is ready.":"File CSV siap diekspor.",
  "Could not read backup data.":"Tidak dapat membaca data cadangan.","Backup snapshot was incomplete.":"Snapshot cadangan tidak lengkap.",
  "Backup snapshot failed.":"Pembuatan snapshot cadangan gagal.","Backup snapshot was cancelled.":"Snapshot cadangan dibatalkan.",
  "Use a backup password with at least 12 characters.":"Gunakan kata sandi cadangan minimal 12 karakter.",
  "Secure encryption is unavailable in this browser. Update Safari and try again.":"Enkripsi aman tidak tersedia di browser ini. Perbarui Safari dan coba lagi.",
  "Encrypted backup created.":"Cadangan terenkripsi berhasil dibuat.","Backup failed. Your existing records were not changed.":"Cadangan gagal dibuat. Catatan Anda yang ada tidak berubah.",
  "This backup is larger than the 50 MB safety limit.":"Ukuran cadangan melebihi batas keamanan 50 MB.",
  "Backup contents are incomplete or unsupported.":"Isi cadangan tidak lengkap atau tidak didukung.",
  "Restore completed. All six data stores have been restored.":"Pemulihan selesai. Keenam penyimpanan data telah dipulihkan.",
  "Backup restored successfully.":"Cadangan berhasil dipulihkan.","Could not decrypt this backup. Check the password and try again.":"Tidak dapat mendekripsi cadangan ini. Periksa kata sandi dan coba lagi.",
  "Restore failed. Your existing records were not changed.":"Pemulihan gagal. Catatan Anda yang ada tidak berubah.",
  "To confirm, type RESET. This permanently clears the six PocketLedger data stores.":"Untuk mengonfirmasi, ketik RESET. Tindakan ini akan menghapus permanen enam penyimpanan data PocketLedger.",
  "Reset cancelled. No data was changed.":"Pengaturan ulang dibatalkan. Tidak ada data yang berubah.",
  "PocketLedger data cleared in this browser. Your backup files and app settings were preserved.":"Data PocketLedger di browser ini telah dihapus. File cadangan dan pengaturan aplikasi tetap tersimpan.",
  "PocketLedger test data cleared.":"Data uji PocketLedger telah dihapus.",
  "Reset failed. Please reload and try again; existing records may remain.":"Pengaturan ulang gagal. Muat ulang dan coba lagi; data yang ada mungkin masih tersimpan.",
  "Terms & Conditions":"Syarat & Ketentuan","Apply language":"Terapkan bahasa"
};
function translateValue(value) {
  if (appLanguage !== "id" || !value) return value;
  if (ID_TRANSLATIONS[value]) return ID_TRANSLATIONS[value];
  const patterns = [
    [/^(\d+) items?$/, "$1 item"],
    [/^(\d+) active goals?$/, "$1 target aktif"],
    [/^(\d+) transactions?$/, "$1 transaksi"],
    [/^(\d+)% used$/, "$1% terpakai"],
    [/^(\d+)% remaining$/, "$1% tersisa"],
    [/^Average daily spending$/, "Rata-rata pengeluaran harian"]
  ];
  for (const [pattern, replacement] of patterns) if (pattern.test(value)) return value.replace(pattern, replacement);
  return value;
}
function translateNode(root = document.body) {
  if (appLanguage !== "id" || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const original = node.nodeValue.trim();
    if (!original) return;
    const translated = translateValue(original);
    if (translated !== original) node.nodeValue = node.nodeValue.replace(original, translated);
  });
  root.querySelectorAll?.("[placeholder],[title],[aria-label]").forEach(element => {
    for (const attribute of ["placeholder","title","aria-label"]) {
      const value = element.getAttribute(attribute);
      const translated = translateValue(value);
      if (value && translated !== value) element.setAttribute(attribute, translated);
    }
  });
}

function setAppLanguage(language) {
  appLanguage = language === "id" ? "id" : "en";
  try { localStorage.setItem(LANGUAGE_KEY, appLanguage); } catch (error) { console.warn("Could not save language preference.", error); }
  location.reload();
}
function initializeLanguage() {
  document.documentElement.lang = appLanguage === "id" ? "id" : "en";
  try { appLanguage = localStorage.getItem(LANGUAGE_KEY) === "id" ? "id" : "en"; } catch (error) { appLanguage = "en"; }
  document.documentElement.lang = appLanguage === "id" ? "id" : "en";
  const selector = $("languageSelect");
  if (selector) selector.value = appLanguage;
  const termsSelector = $("termsLanguageSelect");
  if (termsSelector) termsSelector.value = appLanguage;
  if (appLanguage === "id") {
    translateNode();
    const observer = new MutationObserver(records => records.forEach(record => {
      record.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) translateNode(node); });
      if (record.type === "characterData") translateNode(record.target.parentElement || document.body);
    }));
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
  }
}

// Terms must be accepted before the local finance database is opened.
const TERMS_ACCEPTANCE_KEY = "pocketledgerTermsAccepted_v3";
function openTermsDialog(isGate = false) {
  const dialog = $("termsDialog");
  $("termsConsent").checked = false;
  $("termsAccept").disabled = true;
  $("termsDecline").hidden = isGate;
  $("termsStatus").textContent = "";
  if (appLanguage === "id") {
    $("termsTitle").textContent = "Syarat & Ketentuan";
    $("termsIntro").textContent = "Harap baca syarat berikut sebelum menggunakan PocketLedger.";
    $("termsBody").innerHTML = `
      <h3>1. Hanya alat pencatatan keuangan pribadi</h3>
      <p>PocketLedger adalah alat pencatatan dan penganggaran keuangan pribadi. Aplikasi ini bukan bank, lembaga keuangan, layanan akuntansi, penasihat pajak, penasihat investasi, atau penyedia kredit. Aplikasi ini tidak memberikan nasihat keuangan, hukum, atau pajak.</p>
      <h3>2. Penyimpanan lokal dan privasi</h3>
      <p>Catatan Anda disimpan secara lokal di browser pada perangkat ini. Membagikan tautan aplikasi tidak membagikan catatan Anda. Siapa pun yang memiliki akses ke perangkat atau profil browser yang sama mungkin dapat mengakses catatan lokal. PocketLedger tidak menyediakan akun pengguna atau sinkronisasi cloud.</p>
      <h3>3. Tanggung jawab atas data dan cadangan</h3>
      <p>Anda bertanggung jawab memasukkan informasi yang akurat dan menyimpan cadangan secara mandiri. Kerusakan browser atau perangkat, pembersihan penyimpanan, perubahan aplikasi/browser, atau kehilangan perangkat dapat menyebabkan kehilangan data. Buat cadangan terenkripsi secara berkala dan simpan kata sandinya dengan aman. PocketLedger tidak dapat memulihkan kata sandi cadangan yang terlupa.</p>
      <h3>4. Cadangan terenkripsi dan pemulihan</h3>
      <p>Cadangan terenkripsi dilindungi dengan kata sandi pilihan Anda. Siapa pun yang memiliki file cadangan dan kata sandinya mungkin dapat memulihkan dan membaca catatan di dalamnya. Pemulihan akan menggantikan catatan pada database browser saat ini. Periksa file yang dipilih dan simpan cadangan terpisah sebelum memulihkan.</p>
      <h3>5. Tidak ada jaminan keakuratan keuangan</h3>
      <p>Perhitungan dan laporan bergantung pada informasi yang Anda masukkan serta logika aplikasi saat ini. Verifikasi secara mandiri saldo, anggaran, laporan, transfer, dan hasil lainnya sebelum mengandalkannya untuk keputusan keuangan.</p>
      <h3>6. Ketersediaan dan perubahan</h3>
      <p>Aplikasi disediakan sebagai alat penggunaan pribadi tanpa jaminan ketersediaan tanpa gangguan atau bebas kesalahan. Fitur dapat berubah. Simpan cadangan sebelum menggunakan pembaruan atau melakukan perubahan besar.</p>
      <h3>7. Penggunaan yang diperbolehkan</h3>
      <p>Gunakan PocketLedger secara sah dan hanya untuk catatan yang berhak Anda kelola. Jangan gunakan aplikasi ini sebagai brankas untuk kata sandi, kredensial perbankan, atau rahasia autentikasi yang sangat sensitif.</p>
      <h3>8. Persetujuan</h3>
      <p>Dengan memilih “Saya setuju dan lanjutkan”, Anda menyatakan telah membaca dan memahami syarat ini. Jika tidak setuju, jangan gunakan PocketLedger.</p>`;
    $("termsConsent").querySelector("span").textContent = "Saya telah membaca dan menyetujui Syarat & Ketentuan.";
    $("termsAccept").textContent = "Saya setuju dan lanjutkan";
    $("termsDecline").textContent = "Saya tidak setuju";
  }
  if (!dialog.open) dialog.showModal();
}
function waitForTermsAcceptance() {
  let accepted = false;
  try { accepted = localStorage.getItem(TERMS_ACCEPTANCE_KEY) === "yes"; } catch (error) { console.warn("Terms acceptance storage unavailable.", error); }
  if (accepted) return Promise.resolve(true);
  return new Promise(resolve => {
    openTermsDialog(true);
    $("termsConsent").addEventListener("change", () => { $("termsAccept").disabled = !$("termsConsent").checked; });
    $("termsAccept").addEventListener("click", () => {
      if (!$("termsConsent").checked) return;
      try { localStorage.setItem(TERMS_ACCEPTANCE_KEY, "yes"); } catch (error) { $("termsStatus").textContent = "Could not save acceptance on this device."; return; }
      $("termsDialog").close();
      resolve(true);
    });
    $("termsDecline").addEventListener("click", () => {
      $("termsStatus").textContent = "You must agree to continue. PocketLedger will remain closed.";
      resolve(false);
    });
    $("termsDialog").addEventListener("cancel", event => { event.preventDefault(); $("termsStatus").textContent = "Please agree to the terms or leave PocketLedger."; }, { once:true });
  });
}
$("applyLanguage").addEventListener("click", () => setAppLanguage($("languageSelect").value));
$("termsLanguageSelect").addEventListener("change", () => {
  // Apply the choice before acceptance so the next first-run screen opens in that language.
  setAppLanguage($("termsLanguageSelect").value);
});
$("viewTerms").addEventListener("click", () => openTermsDialog(false));
$("termsConsent").addEventListener("change", () => { $("termsAccept").disabled = !$("termsConsent").checked; });
$("termsAccept").addEventListener("click", () => {
  if (!$("termsConsent").checked) return;
  try { localStorage.setItem(TERMS_ACCEPTANCE_KEY, "yes"); } catch (error) { $("termsStatus").textContent = "Could not save acceptance on this device."; return; }
  $("termsDialog").close();
});
$("termsDecline").addEventListener("click", () => $("termsDialog").close());
initializeLanguage();


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

// SAVINGS GOALS AND DEBT
async function renderGoals() {
  const [goals, accounts] = await Promise.all([allSavingsGoals(), accountBalances()]);
  const activeGoals = goals.filter(goal => goal.archived !== true);
  $("goalSummary").textContent = `${activeGoals.length} active ${activeGoals.length === 1 ? "goal" : "goals"}`;
  const goalList = $("savingsGoalList");
  goalList.replaceChildren();
  if (!activeGoals.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Your savings goals will appear here. Start with an emergency fund or a future purchase.";
    goalList.append(empty);
  }
  activeGoals.sort((a,b) => (a.targetDate || "9999").localeCompare(b.targetDate || "9999"));
  for (const goal of activeGoals) {
    const progress = PocketLedgerCore.calculateGoalProgress(goal.savedAmount, goal.targetAmount);
    const saved = progress.saved;
    const target = progress.target;
    const percent = progress.percent;
    const card = document.createElement("article");
    card.className = "goal-card";
    const top = document.createElement("div");
    top.className = "goal-card-top";
    const name = document.createElement("strong");
    name.textContent = goal.name;
    const pct = document.createElement("span");
    pct.textContent = `${percent.toFixed(0)}%`;
    top.append(name,pct);
    const amounts = document.createElement("div");
    amounts.className = "goal-amounts";
    const current = document.createElement("strong");
    setSensitiveText(current,money(saved));
    const targetText = document.createElement("span");
    targetText.textContent = progress.isComplete
      ? `of ${money(target)} · Goal reached`
      : `of ${money(target)} · ${money(progress.remaining)} to go`;
    amounts.append(current,targetText);
    const track = document.createElement("div");
    track.className = "progress-track goal-progress";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = `${percent}%`;
    track.append(fill);
    const footer = document.createElement("div");
    footer.className = "goal-card-footer";
    const due = document.createElement("small");
    due.textContent = goal.targetDate ? `Target · ${new Date(goal.targetDate+"T00:00:00").toLocaleDateString("en-ID",{day:"numeric",month:"short",year:"numeric"})}` : "No target date";
    const actions = document.createElement("div");
    actions.className = "goal-actions";
    const add = document.createElement("button");
    add.type = "button"; add.className = "secondary";
    add.textContent = progress.isComplete ? "Goal reached" : "Add savings";
    add.disabled = progress.isComplete;
    add.addEventListener("click",async()=>{
      const raw=window.prompt(`How much are you adding to ${goal.name}? (IDR)`);
      if(raw===null)return;
      const amount=Number(raw.trim());
      if(!Number.isSafeInteger(amount)||amount<=0){showToast("Enter a valid positive amount.","error");return;}
      const latest=(await allSavingsGoals()).find(item=>item.id===goal.id);
      if(!latest)return;
      const nextSaved = Number(latest.savedAmount || 0) + amount;
       if (!Number.isSafeInteger(nextSaved)) {
         showToast("That amount is too large to record safely.", "error");
         return;
       }
       latest.savedAmount = nextSaved;
      latest.updatedAt=new Date().toISOString();
      await operation("savingsGoals","readwrite",store=>store.put(latest));
      await renderGoals(); showToast("Savings progress updated.");
    });
    const edit = document.createElement("button");
    edit.type="button"; edit.className="secondary"; edit.textContent="Archive";
    edit.addEventListener("click",async()=>{
      if(!window.confirm(`Archive the goal “${goal.name}”? Its history will be retained.`))return;
      const latest=(await allSavingsGoals()).find(item=>item.id===goal.id);
      if(!latest)return;
      latest.archived=true; latest.archivedAt=new Date().toISOString();
      await operation("savingsGoals","readwrite",store=>store.put(latest));
      await renderGoals(); showToast("Savings goal archived.");
    });
    actions.append(add,edit); footer.append(due,actions);
    card.append(top,amounts,track,footer); goalList.append(card);
  }

  const debtList=$("debtOverview");
  debtList.replaceChildren();
  const debts=accounts.filter(account=>account.active!==false&&account.classification==="liability");
  if(!debts.length){
    const empty=document.createElement("p"); empty.className="empty";
    empty.textContent="No active debts recorded. Add a credit card, loan or other liability in Settings to track it here.";
    debtList.append(empty);
  } else {
    const total=debts.reduce((sum,account)=>sum+Math.max(0,Number(account.balance||0)),0);
    const totalCard=document.createElement("div"); totalCard.className="goal-debt-total";
    const label=document.createElement("span"); label.textContent="Total outstanding debt";
    const value=document.createElement("strong"); setSensitiveText(value,money(total));
    totalCard.append(label,value); debtList.append(totalCard);
    debts.forEach(account=>{
      const row=document.createElement("div"); row.className="goal-debt-row";
      const info=document.createElement("div");
      const name=document.createElement("strong"); name.textContent=account.name;
      const type=document.createElement("small");
       if (account.type === "Credit card") {
         const details = [];
         const limit = Number(account.creditLimit || 0);
         const outstanding = Math.max(0, Number(account.balance || 0));
         if (limit > 0) details.push(`${Math.min(100, outstanding / limit * 100).toFixed(0)}% of limit`);
         if (Number(account.dueDay) > 0) details.push(`Due day ${account.dueDay}`);
         if (Number(account.minimumPayment) > 0) details.push(`Minimum ${money(account.minimumPayment)}`);
         type.textContent = details.length ? `Credit card · ${details.join(" · ")}` : "Credit card";
       } else {
         type.textContent = account.type;
       }
      info.append(name,type);
      const amount=document.createElement("strong"); setSensitiveText(amount,money(Math.max(0, Number(account.balance || 0))));
      row.append(info,amount); debtList.append(row);
    });
  }
}

$("savingsGoalForm").onsubmit=async event=>{
  event.preventDefault();
  const name=$("goalName").value.trim();
  const targetAmount=Number($("goalTarget").value);
  const savedAmount=Number($("goalSaved").value||0);
  const targetDate=$("goalDate").value||null;
  if(!name||!Number.isSafeInteger(targetAmount)||targetAmount<=0||!Number.isSafeInteger(savedAmount)||savedAmount<0){
    $("goalStatus").textContent="Enter a goal name, a valid target and a non-negative saved amount.";return;
  }
  if(savedAmount>targetAmount){$("goalStatus").textContent="Already saved cannot exceed the target amount.";return;}
  const goal={id:makeId("goal"),name,targetAmount,savedAmount,targetDate,createdAt:new Date().toISOString(),archived:false};
  try{
    await operation("savingsGoals","readwrite",store=>store.add(goal));
    $("savingsGoalForm").reset(); $("goalSaved").value="0";
    $("goalStatus").textContent="Savings goal saved on this device.";
    await renderGoals(); showToast("Savings goal created.");
  }catch(error){console.error(error);$("goalStatus").textContent="Could not save this goal.";}
};

// REFRESH ALL SCREENS

async function refreshAll() {
  await render();
  await renderTransactions();
  await renderAccounts();
  if ($("budgetsScreen").classList.contains("active")) await renderGoals();

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

$("budgetMonth").onchange = () => renderBudgets().catch(console.error);
$("budgetDay").onchange = () => renderBudgets().catch(console.error);
$("budgetYear").onchange = () => renderBudgets().catch(console.error);
document.querySelectorAll("[data-budget-period]").forEach(button => button.addEventListener("click", () => { budgetPeriod=button.dataset.budgetPeriod; renderBudgets().catch(console.error); }));
$("analyticsMonth").onchange = () =>
  renderAnalytics().catch(console.error);
document.querySelectorAll(".period-btn").forEach(button => {
  button.addEventListener("click", () => {
    dashboardPeriod = button.dataset.period;
    render().catch(console.error);
  });
});

// ENCRYPTED FULL-DATABASE BACKUP / RESTORE
const BACKUP_FORMAT = "pocketledger-encrypted-backup";
const BACKUP_VERSION = 1;
const BACKUP_STORES = ["transactions", "budgets", "accounts", "journalEntries", "transfers", "savingsGoals"];

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
async function deriveBackupKey(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}
async function collectBackupData(){return new Promise((resolve,reject)=>{const tx=db.transaction(BACKUP_STORES,"readonly"),data={};let pending=BACKUP_STORES.length;for(const name of BACKUP_STORES){const req=tx.objectStore(name).getAll();req.onsuccess=()=>{data[name]=req.result;pending--;};req.onerror=()=>reject(req.error||Error("Could not read backup data."));}tx.oncomplete=()=>pending===0?resolve(data):reject(Error("Backup snapshot was incomplete."));tx.onerror=()=>reject(tx.error||Error("Backup snapshot failed."));tx.onabort=()=>reject(tx.error||Error("Backup snapshot was cancelled."));});}
function downloadBackup(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.style.display = "none";
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$("createBackup").addEventListener("click", async () => {
  const status = $("backupStatus"), password = $("backupPassword").value;
  if (password.length < 12) { status.textContent = "Use a backup password with at least 12 characters."; return; }
  if (!globalThis.crypto?.subtle) { status.textContent = "Secure encryption is unavailable in this browser. Update Safari and try again."; return; }
  const button = $("createBackup"); button.disabled = true;
  try {
    const payload = new TextEncoder().encode(JSON.stringify({
      format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(),
      currency: "IDR", data: await collectBackupData()
    }));
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
    const file = {
      format: BACKUP_FORMAT, version: BACKUP_VERSION, cipher: "AES-256-GCM",
      kdf: "PBKDF2-SHA-256", iterations: 310000, salt: bytesToBase64(salt),
      iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted))
    };
    downloadBackup(new Blob([JSON.stringify(file)], { type: "application/json" }), `pocketledger-backup-${localDate()}.json`);
    status.textContent = "Encrypted full backup created. Save the file somewhere safe; you will need this password to restore it.";
    showToast("Encrypted backup created.");
  } catch (error) {
    console.error(error); status.textContent = "Backup failed. Your existing records were not changed.";
  } finally { button.disabled = false; }
});
$("chooseBackup").addEventListener("click", () => $("backupFile").click());
$("backupFile").addEventListener("change", async event => {
  const file = event.target.files?.[0], status = $("backupStatus");
  if (!file) return;
  const password = $("backupPassword").value;
  if (password.length < 12) {
    status.textContent = "Enter the backup password (at least 12 characters) before restoring.";
    event.target.value = ""; return;
  }
  if (file.size > 50 * 1024 * 1024) {
    status.textContent = "This backup is larger than the 50 MB safety limit.";
    event.target.value = ""; return;
  }
  try {
    const envelope = JSON.parse(await file.text());
    PocketLedgerCore.validateBackupEnvelope(envelope);
    const key = await deriveBackupKey(password, base64ToBytes(envelope.salt));
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext)
    );
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    if (payload.format !== BACKUP_FORMAT || payload.version !== BACKUP_VERSION) {
      throw new Error("Backup contents are incomplete or unsupported.");
    }
    PocketLedgerCore.validateBackupData(payload.data, BACKUP_STORES);
    const counts = BACKUP_STORES.map(name => `${name}: ${payload.data[name].length}`).join("\n");
    if (!confirm("Restore this backup?\n\nThis replaces the records currently stored in this browser with the records in the backup. Export a backup of current data first if you may need it.\n\n" + counts)) return;
    await atomicWrite(BACKUP_STORES, tx => {
      for (const name of BACKUP_STORES) {
        const store = tx.objectStore(name);
        store.clear();
        payload.data[name].forEach(record => store.put(record));
      }
    });
    status.textContent = "Restore completed. All six data stores have been restored.";
    showToast("Backup restored successfully.");
    await refreshAll();
  } catch (error) {
    console.error(error);
    status.textContent = error.name === "OperationError"
      ? "Could not decrypt this backup. Check the password and try again."
      : (error.message || "Restore failed. Your existing records were not changed.");
  } finally { event.target.value = ""; }
});

// EXPLICIT LOCAL DATA RESET
// Clears only PocketLedger's six financial stores in this browser.
// It preserves the database schema, app files, privacy preference and external backup files.
$("resetTestData").addEventListener("click", async () => {
  const status = $("resetDataStatus");
  const counts = {};
  try {
    for (const name of BACKUP_STORES) {
      counts[name] = await operation(name, "readonly", store => store.count());
    }
    const summary = BACKUP_STORES.map(name => `${name}: ${counts[name]}`).join("\n");
    if (!window.confirm(
      "Reset all PocketLedger data in this browser? This cannot be undone.\n\n" +
      "Your encrypted backup files in Files/iCloud Drive will not be deleted.\n\n" + summary
    )) return;
    const confirmation = window.prompt('To confirm, type RESET. This permanently clears the six PocketLedger data stores.');
    if (confirmation !== "RESET") {
      status.textContent = "Reset cancelled. No data was changed.";
      return;
    }
    await atomicWrite(BACKUP_STORES, tx => {
      for (const name of BACKUP_STORES) tx.objectStore(name).clear();
    });
    await refreshAll();
    status.textContent = "PocketLedger data cleared in this browser. Your backup files and app settings were preserved.";
    showToast("PocketLedger test data cleared.");
  } catch (error) {
    console.error(error);
    status.textContent = "Reset failed. Please reload and try again; existing records may remain.";
  }
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
  showToast("CSV export is ready.");
};

async function processDueRecurringTransactions(){const today=localDate(),transactions=await all(),accounts=await allAccounts(),sources=transactions.filter(x=>x.recurringRule?.active&&x.recurringRule?.nextDate&&!x.recurringSourceId);for(const source of sources){let nextDate=source.recurringRule.nextDate,generated=0;while(nextDate<=today&&generated<120){if(!transactions.some(x=>x.recurringSourceId===source.id&&x.date===nextDate)){const account=source.accountId?accounts.find(a=>a.id===source.accountId&&a.active!==false):null;if(source.accountId&&!account)break;const occurrence={...source,date:nextDate,recurringSourceId:source.id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};delete occurrence.id;delete occurrence.recurringRule;await atomicWrite(["transactions","journalEntries"],tx=>{const req=tx.objectStore("transactions").add(occurrence);req.onsuccess=()=>makeTransactionLedgerRows(occurrence,account,req.result).forEach(x=>tx.objectStore("journalEntries").add(x));});}nextDate=PocketLedgerCore.nextRecurringDate(nextDate,source.recurringRule.frequency,source.date);generated++;}if(nextDate!==source.recurringRule.nextDate){source.recurringRule={...source.recurringRule,nextDate};await operation("transactions","readwrite",s=>s.put(source));}}}
// START APPLICATION

(async () => {
  try {
    const accepted = await waitForTermsAcceptance();
    if (!accepted) return;
    db = await openDB();
    await processDueRecurringTransactions();

    $("date").value = localDate();
    $("openingDate").value = localDate();
    $("transferDate").value = localDate();
    $("month").value = localDate();
    $("budgetMonth").value = currentMonth();
    $("budgetDay").value = localDate();
    $("budgetYear").value = localDate().slice(0,4);
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
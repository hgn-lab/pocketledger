
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

let db;
let dashboardPeriod = "monthly";

function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("PocketLedgerDB", 1);

    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("transactions")) {
        r.result.createObjectStore("transactions", {
          keyPath: "id",
          autoIncrement: true
        });
      }
    };

    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function operation(mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("transactions", mode);
    const store = tx.objectStore("transactions");
    const req = action(store);

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

const all = () => operation("readonly", s => s.getAll());
const add = item => operation("readwrite", s => s.add(item));
const remove = id => operation("readwrite", s => s.delete(id));

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

  $("income").textContent = money(income);
  $("expenses").textContent = money(expenses);
  $("balance").textContent = money(income - expenses);
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

  // Calculate active days
  const activeDays = new Set(rows.map(x => x.date)).size;

  // Calculate insights
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

  const insightContainer = $("periodInsights");
  insightContainer.replaceChildren();

  for (const [label, value] of insights) {
    const card = document.createElement("div");
    card.className = "insight-card";

    const title = document.createElement("span");
    title.textContent = label;

    const amount = document.createElement("strong");
    amount.textContent = value;

    card.append(title, amount);
    insightContainer.append(card);
  }

  // Render transactions
  const list = $("list");
  list.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No transactions for this period yet.";
    list.append(empty);
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

    amount.textContent =
      (item.type === "income" ? "+" : "−") + money(item.amount);

    const button = document.createElement("button");
    button.className = "delete";
    button.textContent = "Delete";

    button.onclick = async () => {
      if (confirm("Delete this transaction?")) {
        await remove(item.id);
        await render();
      }
    };

    right.append(amount, button);
    row.append(info, right);
    list.append(row);
  }
}

// Add a transaction
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
    $("month").value = date;

    $("status").textContent =
      "Transaction saved on this device.";

    await render();
  } catch (error) {
    $("status").textContent = "Could not save transaction.";
    console.error(error);
  }
};

// Change selected date
$("month").onchange = () => render().catch(console.error);

// Change dashboard period
document.querySelectorAll(".period-btn").forEach(button => {
  button.addEventListener("click", () => {
    dashboardPeriod = button.dataset.period;
    render().catch(console.error);
  });
});

// Export all transactions
$("export").onclick = async () => {
  const rows = await all();

  const cell = value =>
    '"' + String(value).replaceAll('"', '""') + '"';

  const csv = [
    ["Date", "Type", "Description", "Category", "Amount"]
      .map(cell).join(","),
    ...rows.map(x =>
      [x.date, x.type, x.description, x.category, x.amount]
        .map(cell).join(",")
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

// Start application
(async () => {
  try {
    db = await openDB();

    $("date").value = localDate();
    $("month").value = localDate();

    await render();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("./service-worker.js")
        .catch(console.error);
    }
  } catch (error) {
    console.error(error);
    alert("Unable to open local storage. Check Safari settings.");
  }
})();

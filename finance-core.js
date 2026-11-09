/* Pure financial calculations shared by the PocketLedger UI and Node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PocketLedgerCore = api;
})(globalThis, function () {
  "use strict";

  function isValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function isValidMonth(value) {
    return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) && isValidDate(value + "-01");
  }

  function daysInMonth(monthValue) {
    if (!isValidMonth(monthValue)) throw new RangeError("Month must use a valid YYYY-MM value.");
    const [year, month] = monthValue.split("-").map(Number);
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month, 0);
    return date.getUTCDate();
  }

  function getPeriodRange(dateValue, period) {
    if (!isValidDate(dateValue)) throw new RangeError("Date must be a valid YYYY-MM-DD value.");
    const [year, month] = dateValue.split("-").map(Number);
    if (period === "daily") return [dateValue, dateValue];
    if (period === "monthly") {
      const monthKey = year + "-" + String(month).padStart(2, "0");
      return [monthKey + "-01", monthKey + "-" + String(daysInMonth(monthKey)).padStart(2, "0")];
    }
    if (period === "yearly") return [year + "-01-01", year + "-12-31"];
    throw new RangeError("Unsupported period: " + period);
  }

  function validAmount(value) {
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
  }

  function sumAmounts(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
      const next = sum + validAmount(row && row.amount);
      return Number.isSafeInteger(next) ? next : sum;
    }, 0);
  }

  function expenseRowsForMonth(transactions, monthValue) {
    if (!isValidMonth(monthValue)) throw new RangeError("Month must use a valid YYYY-MM value.");
    const [start, end] = getPeriodRange(monthValue + "-01", "monthly");
    return (Array.isArray(transactions) ? transactions : []).filter(item =>
      item && item.type === "expense" && typeof item.date === "string" &&
      item.date >= start && item.date <= end && isValidDate(item.date)
    );
  }

  function categoryTotals(rows) {
    const totals = Object.create(null);
    for (const item of (Array.isArray(rows) ? rows : [])) {
      if (!item || item.type !== "expense") continue;
      const category = typeof item.category === "string" && item.category.trim() ? item.category.trim() : "Other";
      const next = (totals[category] || 0) + validAmount(item.amount);
      if (Number.isSafeInteger(next)) totals[category] = next;
    }
    return totals;
  }

  function calculateBudgetMetrics(spentValue, limitValue, daysValue) {
    const spent = validAmount(spentValue);
    const limit = validAmount(limitValue);
    const days = Number.isSafeInteger(Number(daysValue)) && Number(daysValue) > 0 ? Number(daysValue) : 1;
    const percentUsed = limit > 0 ? spent / limit * 100 : 0;
    return {
      spent, limit, remaining: limit - spent, percentUsed,
      remainingPercent: limit > 0 ? Math.max(0, 100 - percentUsed) : 0,
      progressPercent: Math.min(100, percentUsed), dailyAverage: spent / days,
      warning: limit > 0 && percentUsed >= 75, overBudget: limit > 0 && spent > limit
    };
  }


  // Anchor monthly/yearly recurrences to the original transaction date.
  function nextRecurringDate(value, frequency, anchorDate = value) {
    if (!isValidDate(value) || !isValidDate(anchorDate)) throw new RangeError("Recurring dates must be valid YYYY-MM-DD values.");
    if (!["weekly", "monthly", "yearly"].includes(frequency)) throw new RangeError("Unsupported recurring frequency: " + frequency);
    const [year, month, day] = value.split("-").map(Number);
    const [, anchorMonth, anchorDay] = anchorDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7);
    else if (frequency === "monthly") {
      const targetMonth = date.getUTCMonth() + 1;
      const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = targetMonth % 12;
      const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
      date.setUTCFullYear(targetYear, normalizedMonth, Math.min(anchorDay, lastDay));
    } else {
      const targetYear = date.getUTCFullYear() + 1;
      const lastDay = new Date(Date.UTC(targetYear, anchorMonth, 0)).getUTCDate();
      date.setUTCFullYear(targetYear, anchorMonth - 1, Math.min(anchorDay, lastDay));
    }
    return date.toISOString().slice(0, 10);
  }


  function calculateLedgerBalanceDelta(classification, direction, amountValue) {
    const amount = Number(amountValue);
    if (!["asset", "liability"].includes(classification) ||
        !["increase", "decrease"].includes(direction) ||
        !Number.isSafeInteger(amount) || amount <= 0) {
      throw new RangeError("Ledger movement requires a valid account type, direction and positive whole-IDR amount.");
    }
    const movement = direction === "increase" ? amount : -amount;
    return classification === "liability" ? -movement : movement;
  }

  function calculateAccountBalance(openingBalanceValue, entries, accountId) {
    const openingBalance = Number(openingBalanceValue || 0);
    if (!Number.isSafeInteger(openingBalance) || openingBalance < 0) {
      throw new RangeError("Opening balance must be a non-negative whole-IDR amount.");
    }
    let balance = openingBalance;
    for (const entry of (Array.isArray(entries) ? entries : [])) {
      if (!entry || entry.accountId !== accountId) continue;
      const delta = Number(entry.balanceDelta || 0);
      if (!Number.isSafeInteger(delta)) throw new RangeError("Ledger entry contains an invalid balance movement.");
      const next = balance + delta;
      if (!Number.isSafeInteger(next)) throw new RangeError("Account balance exceeds the supported IDR range.");
      balance = next;
    }
    return balance;
  }

  function calculateCreditMetrics(limitValue, outstandingValue) {
    const limit = Number(limitValue || 0);
    const outstanding = Number(outstandingValue || 0);
    if (!Number.isSafeInteger(limit) || limit < 0 ||
        !Number.isSafeInteger(outstanding)) {
      throw new RangeError("Credit limit and outstanding balance must be whole-IDR amounts.");
    }
    const utilizationPercent = limit > 0 ? outstanding / limit * 100 : 0;
    return {
      limit, outstanding, availableCredit: limit - outstanding,
      utilizationPercent, progressPercent: Math.max(0, Math.min(100, utilizationPercent)),
      isOverLimit: limit > 0 && outstanding > limit
    };
  }

  function calculateGoalProgress(savedValue, targetValue) {
    const saved = validAmount(savedValue);
    const target = Number.isSafeInteger(Number(targetValue)) && Number(targetValue) > 0 ? Number(targetValue) : 1;
    return { saved, target, remaining: Math.max(0, target - saved), percent: Math.min(100, saved / target * 100), isComplete: saved >= target };
  }


  function validateBackupEnvelope(envelope) {
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
        envelope.format !== "pocketledger-encrypted-backup" || envelope.version !== 1 ||
        envelope.cipher !== "AES-256-GCM" || envelope.kdf !== "PBKDF2-SHA-256" ||
        envelope.iterations !== 310000 ||
        typeof envelope.salt !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(envelope.salt) ||
        typeof envelope.iv !== "string" || !/^[A-Za-z0-9+/]{16}$/.test(envelope.iv) ||
        typeof envelope.ciphertext !== "string" || envelope.ciphertext.length < 24 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.ciphertext)) {
      throw new RangeError("Backup file metadata is invalid or unsupported.");
    }
    return true;
  }

  function validateBackupData(data, storeNames) {
    if (!data || typeof data !== "object" || Array.isArray(data) ||
        !Array.isArray(storeNames) || !storeNames.length ||
        !storeNames.every(name => Array.isArray(data[name]))) {
      throw new RangeError("Backup contents are incomplete or unsupported.");
    }
    for (const name of storeNames) {
      const ids = new Set();
      for (const record of data[name]) {
        if (!record || typeof record !== "object" || Array.isArray(record) ||
            !("id" in record) || !["string", "number"].includes(typeof record.id) ||
            String(record.id).length === 0 || ids.has(String(record.id))) {
          throw new RangeError("Backup contains an invalid or duplicate record in " + name + ".");
        }
        ids.add(String(record.id));
        if (name === "transactions" && (! ["income", "expense"].includes(record.type) || !Number.isSafeInteger(record.amount) || record.amount <= 0 || !isValidDate(record.date) || typeof record.description !== "string")) throw new RangeError("Backup contains an invalid transaction.");
        if (name === "budgets" && (!isValidMonth(record.month) || typeof record.category !== "string" || !record.category.trim() || !Number.isSafeInteger(record.amount) || record.amount <= 0)) throw new RangeError("Backup contains an invalid budget.");
        if (name === "accounts" && (typeof record.name !== "string" || !record.name.trim() || !["asset", "liability"].includes(record.classification) || !Number.isSafeInteger(Number(record.openingBalance)) || Number(record.openingBalance) < 0)) throw new RangeError("Backup contains an invalid account.");
        if (name === "journalEntries" && (!Number.isSafeInteger(record.amount) || record.amount < 0 || !isValidDate(record.date) || typeof record.accountId !== "string" || !record.accountId || !Number.isSafeInteger(Number(record.balanceDelta || 0)))) throw new RangeError("Backup contains an invalid ledger entry.");
        if (name === "transfers" && (!Number.isSafeInteger(record.amount) || record.amount <= 0 || typeof record.fromAccountId !== "string" || typeof record.toAccountId !== "string" || record.fromAccountId === record.toAccountId || !isValidDate(record.date))) throw new RangeError("Backup contains an invalid transfer.");
        if (name === "savingsGoals" && (typeof record.name !== "string" || !record.name.trim() || !Number.isSafeInteger(Number(record.targetAmount)) || Number(record.targetAmount) <= 0 || !Number.isSafeInteger(Number(record.savedAmount || 0)) || Number(record.savedAmount || 0) < 0 || (record.targetDate && !isValidDate(record.targetDate)))) throw new RangeError("Backup contains an invalid savings goal.");
      }
    }
    if (storeNames.includes("accounts")) {
      const accountIds = new Set(data.accounts.map(account => String(account.id)));
      for (const transaction of data.transactions || []) {
        if (transaction.accountId != null && !accountIds.has(String(transaction.accountId))) throw new RangeError("Backup transaction refers to a missing account.");
      }
      for (const entry of data.journalEntries || []) {
        if (entry.accountId != null && !accountIds.has(String(entry.accountId))) throw new RangeError("Backup ledger entry refers to a missing account.");
      }
      for (const transfer of data.transfers || []) {
        if (!accountIds.has(String(transfer.fromAccountId)) || !accountIds.has(String(transfer.toAccountId))) throw new RangeError("Backup transfer refers to a missing account.");
      }
      for (const account of data.accounts) {
        if (account.paymentAccountId != null && !accountIds.has(String(account.paymentAccountId))) throw new RangeError("Backup account refers to a missing payment account.");
      }
    }
    return true;
  }

  return { validateBackupEnvelope, validateBackupData, isValidDate, isValidMonth, daysInMonth, getPeriodRange, sumAmounts, expenseRowsForMonth, categoryTotals, calculateBudgetMetrics, calculateGoalProgress, nextRecurringDate, calculateLedgerBalanceDelta, calculateAccountBalance, calculateCreditMetrics };
});

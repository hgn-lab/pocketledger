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

  function calculateGoalProgress(savedValue, targetValue) {
    const saved = validAmount(savedValue);
    const target = Number.isSafeInteger(Number(targetValue)) && Number(targetValue) > 0 ? Number(targetValue) : 1;
    return { saved, target, remaining: Math.max(0, target - saved), percent: Math.min(100, saved / target * 100), isComplete: saved >= target };
  }

  return { isValidDate, isValidMonth, daysInMonth, getPeriodRange, sumAmounts, expenseRowsForMonth, categoryTotals, calculateBudgetMetrics, calculateGoalProgress, nextRecurringDate };
});

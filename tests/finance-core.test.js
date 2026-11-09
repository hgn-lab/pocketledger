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

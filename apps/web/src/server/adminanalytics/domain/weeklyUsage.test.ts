/** Tests for the usage trend: Monday-based weeks, zero-filled gaps, ranked split types. */

import { describe, expect, it } from "vitest";
import { assembleWeeks, rankSplitTypes, trailingWeekStarts } from "./weeklyUsage";

describe("trailingWeekStarts", () => {
  it("ends on the Monday of the current week", () => {
    // 11 October 2026 is a Sunday; its week began on Monday the 5th.
    expect(trailingWeekStarts(new Date("2026-10-11T12:00:00Z"), 3)).toEqual([
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ]);
  });

  it("treats a Monday as the first day of its own week", () => {
    expect(trailingWeekStarts(new Date("2026-10-05T00:00:00Z"), 1)).toEqual(["2026-10-05"]);
    expect(trailingWeekStarts(new Date("2026-10-05T23:59:59Z"), 1)).toEqual(["2026-10-05"]);
  });

  it("returns only Mondays, a week apart, across a year boundary", () => {
    const weekStarts = trailingWeekStarts(new Date("2027-01-06T08:00:00Z"), 4);
    expect(weekStarts).toEqual(["2026-12-14", "2026-12-21", "2026-12-28", "2027-01-04"]);
    for (const weekStart of weekStarts) {
      expect(new Date(`${weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it("decides the week in UTC, not by the server's local clock", () => {
    // Late Sunday in UTC is already Monday further east; the week is still the old one.
    expect(trailingWeekStarts(new Date("2026-10-11T23:30:00Z"), 1)).toEqual(["2026-10-05"]);
  });
});

describe("assembleWeeks", () => {
  const weekStarts = ["2026-09-21", "2026-09-28", "2026-10-05"];

  it("gives every week a row, zeros included", () => {
    expect(assembleWeeks(weekStarts, [])).toEqual([
      { weekStart: "2026-09-21", newUserCount: 0, expenseCount: 0, paymentCount: 0, receiptScanCount: 0 },
      { weekStart: "2026-09-28", newUserCount: 0, expenseCount: 0, paymentCount: 0, receiptScanCount: 0 },
      { weekStart: "2026-10-05", newUserCount: 0, expenseCount: 0, paymentCount: 0, receiptScanCount: 0 },
    ]);
  });

  it("files each metric under its own column of its own week", () => {
    const weeks = assembleWeeks(weekStarts, [
      { metric: "users", weekStart: "2026-10-05", count: 2 },
      { metric: "expenses", weekStart: "2026-10-05", count: 14 },
      { metric: "payments", weekStart: "2026-09-21", count: 3 },
      { metric: "scans", weekStart: "2026-09-28", count: 5 },
    ]);

    expect(weeks).toEqual([
      { weekStart: "2026-09-21", newUserCount: 0, expenseCount: 0, paymentCount: 3, receiptScanCount: 0 },
      { weekStart: "2026-09-28", newUserCount: 0, expenseCount: 0, paymentCount: 0, receiptScanCount: 5 },
      { weekStart: "2026-10-05", newUserCount: 2, expenseCount: 14, paymentCount: 0, receiptScanCount: 0 },
    ]);
  });

  it("drops a count for a week outside the trend instead of misfiling it", () => {
    const weeks = assembleWeeks(weekStarts, [
      { metric: "expenses", weekStart: "2026-09-14", count: 99 },
    ]);
    expect(weeks.every((week) => week.expenseCount === 0)).toBe(true);
  });
});

describe("rankSplitTypes", () => {
  it("orders by count, then by name", () => {
    expect(rankSplitTypes({ itemized: 3, equal: 12, shares: 3 })).toEqual([
      { splitType: "equal", count: 12 },
      { splitType: "itemized", count: 3 },
      { splitType: "shares", count: 3 },
    ]);
  });

  it("returns nothing for someone who has added nothing", () => {
    expect(rankSplitTypes({})).toEqual([]);
  });

  it("drops a type with no expenses", () => {
    expect(rankSplitTypes({ equal: 0, exact: 1 })).toEqual([{ splitType: "exact", count: 1 }]);
  });
});

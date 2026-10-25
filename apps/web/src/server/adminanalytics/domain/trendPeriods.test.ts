/** Tests for the usage trend's calendar math: periods, windows and where the page can go. */

import { describe, expect, it } from "vitest";
import {
  assemblePeriods,
  periodEndOn,
  periodStartOf,
  resolveEndOn,
  shiftPeriod,
  trendNavigation,
  utcDay,
  windowStarts,
} from "./trendPeriods";

describe("periodStartOf", () => {
  it("finds the Monday of a week, a Monday and a Sunday included", () => {
    expect(periodStartOf("2026-10-22", "week")).toBe("2026-10-19");
    expect(periodStartOf("2026-10-19", "week")).toBe("2026-10-19");
    expect(periodStartOf("2026-10-25", "week")).toBe("2026-10-19");
  });

  it("finds a week's Monday across a year boundary", () => {
    expect(periodStartOf("2027-01-01", "week")).toBe("2026-12-28");
  });

  it("finds the 1st of a month", () => {
    expect(periodStartOf("2026-02-28", "month")).toBe("2026-02-01");
  });
});

describe("shiftPeriod and periodEndOn", () => {
  it("moves by whole weeks and months, back across years", () => {
    expect(shiftPeriod("2026-01-05", "week", -2)).toBe("2025-12-22");
    expect(shiftPeriod("2026-01-01", "month", -1)).toBe("2025-12-01");
    expect(shiftPeriod("2025-11-01", "month", 3)).toBe("2026-02-01");
  });

  it("ends a week on Sunday and a month on its own last day, leap years included", () => {
    expect(periodEndOn("2026-10-19", "week")).toBe("2026-10-25");
    expect(periodEndOn("2028-02-01", "month")).toBe("2028-02-29");
    expect(periodEndOn("2026-12-01", "month")).toBe("2026-12-31");
  });
});

describe("utcDay", () => {
  it("decides the day in UTC, not by the server's clock", () => {
    expect(utcDay(new Date("2026-10-18T23:30:00-05:00"))).toBe("2026-10-19");
  });
});

describe("resolveEndOn", () => {
  const months = { unit: "month", count: 12 } as const;

  it("reads nothing, and anything after today, as today", () => {
    expect(resolveEndOn("", "2026-10-22", "2025-01-01", months)).toBe("2026-10-22");
    expect(resolveEndOn("2027-01-01", "2026-10-22", "2025-01-01", months)).toBe("2026-10-22");
  });

  it("moves a window that would open before anything happened to the first one", () => {
    expect(resolveEndOn("1990-01-01", "2026-10-22", "2025-01-17", months)).toBe("2025-12-31");
    expect(resolveEndOn("2025-06-30", "2026-10-22", "2025-01-17", months)).toBe("2025-12-31");
  });

  it("keeps the first window when the whole history is shorter than one", () => {
    expect(resolveEndOn("2026-08-01", "2026-10-22", "2026-07-03", months)).toBe("2026-10-22");
  });

  it("keeps a day whose window opens on or after the first thing, and any day before there is anything", () => {
    expect(resolveEndOn("2025-12-15", "2026-10-22", "2025-01-17", months)).toBe("2025-12-15");
    expect(resolveEndOn("2026-03-15", "2026-10-22", "2025-01-17", months)).toBe("2026-03-15");
    expect(resolveEndOn("1990-01-01", "2026-10-22", null, months)).toBe("1990-01-01");
  });
});

describe("windowStarts", () => {
  it("returns the periods ending with the one holding the day, oldest first", () => {
    expect(windowStarts("2026-10-22", "week", 3)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(windowStarts("2026-02-10", "month", 3)).toEqual(["2025-12-01", "2026-01-01", "2026-02-01"]);
  });
});

describe("trendNavigation", () => {
  const today = "2026-10-22";

  it("offers nothing later from the window holding today", () => {
    const starts = windowStarts(today, "week", 12);
    expect(trendNavigation(starts, "week", today, "2025-01-01").laterEndOn).toBe("");
  });

  it("goes earlier to the day before the window, so windows meet without a gap", () => {
    const starts = windowStarts(today, "week", 12);
    const { earlierEndOn } = trendNavigation(starts, "week", today, "2025-01-01");
    expect(earlierEndOn).toBe("2026-08-02");
    expect(windowStarts(earlierEndOn, "week", 12)[11]).toBe(shiftPeriod(starts[0], "week", -1));
  });

  it("goes later by one whole window, never past today", () => {
    const starts = windowStarts("2026-06-30", "month", 12);
    expect(trendNavigation(starts, "month", today, "2020-01-01").laterEndOn).toBe(today);
    const older = windowStarts("2024-06-30", "month", 12);
    expect(trendNavigation(older, "month", today, "2020-01-01").laterEndOn).toBe("2025-06-30");
  });

  it("jumps first to the window that opens with the first thing that happened", () => {
    const starts = windowStarts(today, "month", 12);
    const { firstEndOn } = trendNavigation(starts, "month", today, "2023-04-17");
    expect(windowStarts(firstEndOn, "month", 12)[0]).toBe("2023-04-01");
  });

  it("offers nothing earlier or first once the window holds the first thing", () => {
    const starts = windowStarts("2023-06-30", "month", 12);
    expect(trendNavigation(starts, "month", today, "2023-04-17")).toMatchObject({
      earlierEndOn: "",
      firstEndOn: "",
    });
  });

  it("offers nothing earlier when nothing has happened at all", () => {
    const starts = windowStarts(today, "week", 12);
    expect(trendNavigation(starts, "week", today, null)).toEqual({
      earlierEndOn: "",
      laterEndOn: "",
      firstEndOn: "",
    });
  });
});

describe("assemblePeriods", () => {
  it("gives every period a row with its last day, zeros included", () => {
    const rows = assemblePeriods(["2026-09-01", "2026-10-01"], "month", []);
    expect(rows).toEqual([
      { startOn: "2026-09-01", endOn: "2026-09-30", newUserCount: 0, expenseCount: 0, paymentCount: 0, receiptScanCount: 0 },
      { startOn: "2026-10-01", endOn: "2026-10-31", newUserCount: 0, expenseCount: 0, paymentCount: 0, receiptScanCount: 0 },
    ]);
  });

  it("files each metric under its own period and drops one outside the window", () => {
    const rows = assemblePeriods(["2026-10-19"], "week", [
      { metric: "users", periodStart: "2026-10-19", count: 2 },
      { metric: "expenses", periodStart: "2026-10-19", count: 5 },
      { metric: "payments", periodStart: "2026-10-19", count: 1 },
      { metric: "scans", periodStart: "2026-10-19", count: 3 },
      { metric: "expenses", periodStart: "2026-10-12", count: 9 },
    ]);
    expect(rows[0]).toMatchObject({ newUserCount: 2, expenseCount: 5, paymentCount: 1, receiptScanCount: 3 });
  });
});

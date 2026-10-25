/** Tests for regrouping the window's spending: each slice adds up to the same expenses, and none mixes currencies. */

import { describe, expect, it } from "vitest";
import {
  categorySpendingOf,
  monthlySpendingOf,
  placeActivityOf,
  splitTypeUseOf,
  type BreakdownCell,
} from "./spendingBreakdown";

/**
 * Builds a breakdown cell from the fields a test cares about.
 *
 * @param fields - Fields to override.
 * @returns A cell for one equal-split USD food expense in October, outside any group.
 */
function cell(fields: Partial<BreakdownCell> = {}): BreakdownCell {
  return {
    currency: "USD",
    month: "2026-10",
    category: "food",
    splitType: "equal",
    groupId: "",
    groupName: "",
    groupType: "",
    isMember: false,
    shareCents: 1000,
    paidCents: 0,
    expenseCount: 1,
    ...fields,
  };
}

const TRIP = { groupId: "grp-trip", groupName: "Trip", groupType: "trip", isMember: true };

const CELLS: BreakdownCell[] = [
  cell({ shareCents: 1000, paidCents: 2000 }),
  cell({ category: "travel", shareCents: 500, ...TRIP }),
  cell({ month: "2026-09", splitType: "itemized", shareCents: 300, expenseCount: 2, ...TRIP }),
  cell({ currency: "EUR", shareCents: 700, splitType: "itemized" }),
];

describe("monthlySpendingOf", () => {
  it("adds cells of the same currency and month, and keeps currencies apart", () => {
    expect(monthlySpendingOf(CELLS)).toEqual([
      { currency: "USD", month: "2026-10", shareCents: 1500, paidCents: 2000 },
      { currency: "USD", month: "2026-09", shareCents: 300, paidCents: 0 },
      { currency: "EUR", month: "2026-10", shareCents: 700, paidCents: 0 },
    ]);
  });

  it("returns nothing for an empty window", () => {
    expect(monthlySpendingOf([])).toEqual([]);
  });
});

describe("categorySpendingOf", () => {
  it("adds cells of the same currency and category across months and places", () => {
    expect(categorySpendingOf(CELLS)).toEqual([
      { currency: "USD", category: "food", shareCents: 1300 },
      { currency: "USD", category: "travel", shareCents: 500 },
      { currency: "EUR", category: "food", shareCents: 700 },
    ]);
  });
});

describe("splitTypeUseOf", () => {
  it("counts expenses across currencies, most used first", () => {
    expect(splitTypeUseOf(CELLS)).toEqual([
      { splitType: "itemized", expenseCount: 3 },
      { splitType: "equal", expenseCount: 2 },
    ]);
  });

  it("breaks a tie by name", () => {
    expect(
      splitTypeUseOf([cell({ splitType: "shares" }), cell({ splitType: "exact" })]).map(
        (entry) => entry.splitType,
      ),
    ).toEqual(["exact", "shares"]);
  });
});

describe("placeActivityOf", () => {
  it("counts expenses per place, with outside-groups as a place of its own", () => {
    expect(placeActivityOf(CELLS, 5)).toEqual([
      { groupId: "grp-trip", name: "Trip", type: "trip", isMember: true, expenseCount: 3 },
      { groupId: "", name: "", type: "", isMember: false, expenseCount: 2 },
    ]);
  });

  it("keeps only the busiest places", () => {
    const busy = [
      cell({ groupId: "grp-a", groupName: "Alpha", expenseCount: 1 }),
      cell({ groupId: "grp-b", groupName: "Beta", expenseCount: 9 }),
      cell({ groupId: "grp-c", groupName: "Gamma", expenseCount: 4 }),
    ];

    expect(placeActivityOf(busy, 2).map((place) => place.name)).toEqual(["Beta", "Gamma"]);
  });

  it("puts a named group ahead of the outside-groups row it ties with", () => {
    const tied = [cell({ expenseCount: 2 }), cell({ ...TRIP, expenseCount: 2 })];

    expect(placeActivityOf(tied, 5).map((place) => place.groupId)).toEqual(["grp-trip", ""]);
  });

  it("carries through that the person has left a group", () => {
    const left = [cell({ groupId: "grp-old", groupName: "Old flat", isMember: false })];

    expect(placeActivityOf(left, 5)[0]).toMatchObject({ groupId: "grp-old", isMember: false });
  });

  it("is consistent: every slice accounts for the same number of expenses", () => {
    const total = CELLS.reduce((count, entry) => count + entry.expenseCount, 0);

    expect(splitTypeUseOf(CELLS).reduce((count, entry) => count + entry.expenseCount, 0)).toBe(
      total,
    );
    expect(placeActivityOf(CELLS, 99).reduce((count, entry) => count + entry.expenseCount, 0)).toBe(
      total,
    );
  });
});

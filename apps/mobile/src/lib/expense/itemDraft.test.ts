/** Unit tests for the itemized-draft helpers shared by the scan flow and the expense form. */

import { describe, expect, it } from "vitest";
import {
  draftCompleteness,
  draftItemsFromLines,
  draftTotals,
  itemizedWarnings,
  itemsPayload,
  percentOfItems,
  previewItemizedShares,
  unassignedCount,
} from "./itemDraft";

describe("itemized draft helpers", () => {
  it("sums items, tax and tip into the grand total", () => {
    const items = draftItemsFromLines([
      { name: "Naan", quantity: 2, totalCents: 600 },
      { name: "Curry", quantity: 1, totalCents: 1450 },
    ], "USD");
    expect(draftTotals(items, "1.50", "3.00", "USD")).toEqual({
      itemsTotalCents: 2050,
      taxCents: 150,
      tipCents: 300,
      grandTotalCents: 2500,
    });
  });

  it("keeps stored portion counts and sends back only people still on the line", () => {
    const items = draftItemsFromLines([
      {
        name: "Naan",
        quantity: 2,
        totalCents: 600,
        assignments: [{ userId: "user-a", weight: 2 }, { userId: "user-b" }],
      },
    ], "USD");
    expect(items[0].assignees).toEqual({ "user-a": 2, "user-b": 1 });

    items[0].assignees["user-b"] = 0;
    expect(itemsPayload(items, "USD")).toEqual([
      { id: "", name: "Naan", quantity: 2, totalCents: 600, assignments: [{ userId: "user-a", weight: 2 }] },
    ]);
  });

  it("names the first thing to fix before a draft can be saved", () => {
    const empty = draftTotals([], "0.00", "0.00", "USD");
    expect(draftCompleteness([], empty)).toMatchObject({ ok: false, message: /at least one item/ });

    const unpriced = draftItemsFromLines([{ name: "Naan", quantity: 1, totalCents: 0 }], "USD");
    expect(draftCompleteness(unpriced, draftTotals(unpriced, "0", "0", "USD")).message).toMatch(/price/);

    const unassigned = draftItemsFromLines([{ name: "Naan", quantity: 1, totalCents: 600 }], "USD");
    expect(unassignedCount(unassigned)).toBe(1);
    expect(draftCompleteness(unassigned, draftTotals(unassigned, "0", "0", "USD")).message).toMatch(
      /1 item still needs someone/,
    );

    unassigned[0].assignees = { "user-a": 1 };
    expect(draftCompleteness(unassigned, draftTotals(unassigned, "0", "0", "USD")).ok).toBe(true);
  });

  it("previews per-person shares by portion, with tax and tip in proportion", () => {
    const items = draftItemsFromLines([
      { name: "Chai", quantity: 2, totalCents: 900, assignments: [{ userId: "you", weight: 2 }, { userId: "ani", weight: 1 }] },
      { name: "Fries", quantity: 1, totalCents: 600, assignments: [{ userId: "you" }, { userId: "ani" }] },
    ], "USD");
    // Chai 600/300, fries 300/300 => 900/600 before the 150 of tax splits 90/60.
    expect(previewItemizedShares(items, 150, 0, "USD")).toEqual({ you: 990, ani: 660 });
  });

  it("previews nothing while the draft cannot be allocated", () => {
    const unassigned = draftItemsFromLines([{ name: "Naan", quantity: 1, totalCents: 600 }], "USD");
    expect(previewItemizedShares(unassigned, 0, 0, "USD")).toEqual({});
    expect(previewItemizedShares([], 0, 0, "USD")).toEqual({});
  });

  it("warns about unassigned money and missing amounts, in that order", () => {
    const items = draftItemsFromLines([
      { name: "Baklava", quantity: 1, totalCents: 700 },
      { name: "Extra shot", quantity: 1, totalCents: 0, assignments: [{ userId: "you" }] },
    ], "USD");
    expect(itemizedWarnings(items, "USD")).toEqual(["$7.00 unassigned", "1 item needs an amount"]);
    items[0].assignees = { you: 1 };
    items[1].total = "1.00";
    expect(itemizedWarnings(items, "USD")).toEqual([]);
  });

  it("reads tax and tip back as a rate on the items", () => {
    expect(percentOfItems(890, 10000)).toBe("8.9%");
    expect(percentOfItems(1800, 10000)).toBe("18%");
    expect(percentOfItems(0, 10000)).toBe("");
    expect(percentOfItems(500, 0)).toBe("");
  });
});

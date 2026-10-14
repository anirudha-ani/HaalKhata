/** Unit tests for the itemized-draft helpers shared by the scan flow and the expense form. */

import { describe, expect, it } from "vitest";
import { draftCompleteness, draftItemsFromLines, draftTotals, unassignedCount } from "./itemDraft";
import { itemizedWarnings } from "@haalkhata/shared/expense/form/itemizedWarnings";
import { buildItemsPayload as itemsPayload, percentOfItems, previewItemizedShares } from "@haalkhata/shared/expense/form/splitForm";

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
    expect(draftCompleteness([], "USD")).toMatchObject({ ok: false, message: /at least one item/ });

    const unpriced = draftItemsFromLines([{ name: "Naan", quantity: 1, totalCents: 0 }], "USD");
    expect(draftCompleteness(unpriced, "USD").message).toMatch(/amount/);

    const unassigned = draftItemsFromLines([{ name: "Naan", quantity: 1, totalCents: 600 }], "USD");
    expect(unassignedCount(unassigned)).toBe(1);
    expect(draftCompleteness(unassigned, "USD").message).toMatch(
      /1 item is unassigned/,
    );

    unassigned[0].assignees = { "user-a": 1 };
    expect(draftCompleteness(unassigned, "USD").ok).toBe(true);
  });

  it("rejects a missing line price even when another priced line makes the total positive", () => {
    const items = draftItemsFromLines([
      { name: "Meal", quantity: 1, totalCents: 1200, assignments: [{ userId: "you" }] },
      { name: "Drink", quantity: 1, totalCents: 0, assignments: [{ userId: "you" }] },
    ], "USD");
    expect(draftTotals(items, "0", "0", "USD").grandTotalCents).toBe(1200);
    expect(draftCompleteness(items, "USD")).toEqual({ ok: false, message: "1 item needs an amount" });
    items[1].total = "3.00";
    expect(draftCompleteness(items, "USD").ok).toBe(true);
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

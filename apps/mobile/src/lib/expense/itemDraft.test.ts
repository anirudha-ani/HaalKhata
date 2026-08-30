/** Unit tests for the itemized-draft helpers shared by the scan flow and the expense form. */

import { describe, expect, it } from "vitest";
import {
  draftCompleteness,
  draftItemsFromLines,
  draftTotals,
  itemsPayload,
  unassignedCount,
} from "./itemDraft";

describe("itemized draft helpers", () => {
  it("sums items, tax and tip into the grand total", () => {
    const items = draftItemsFromLines([
      { name: "Naan", quantity: 2, totalCents: 600 },
      { name: "Curry", quantity: 1, totalCents: 1450 },
    ]);
    expect(draftTotals(items, "1.50", "3.00")).toEqual({
      itemsTotalCents: 2050,
      taxCents: 150,
      tipCents: 300,
      grandTotalCents: 2500,
    });
  });

  it("loads a stored expense's assignments and sends back only the checked ones", () => {
    const items = draftItemsFromLines([
      { name: "Naan", quantity: 2, totalCents: 600, assignments: [{ userId: "user-a" }] },
    ]);
    expect(items[0].assignees).toEqual({ "user-a": true });

    items[0].assignees["user-b"] = false;
    expect(itemsPayload(items)).toEqual([
      { id: "", name: "Naan", quantity: 2, totalCents: 600, assignments: [{ userId: "user-a", weight: 1 }] },
    ]);
  });

  it("names the first thing to fix before a draft can be saved", () => {
    const empty = draftTotals([], "0.00", "0.00");
    expect(draftCompleteness([], empty)).toMatchObject({ ok: false, message: /at least one item/ });

    const unpriced = draftItemsFromLines([{ name: "Naan", quantity: 1, totalCents: 0 }]);
    expect(draftCompleteness(unpriced, draftTotals(unpriced, "0", "0")).message).toMatch(/price/);

    const unassigned = draftItemsFromLines([{ name: "Naan", quantity: 1, totalCents: 600 }]);
    expect(unassignedCount(unassigned)).toBe(1);
    expect(draftCompleteness(unassigned, draftTotals(unassigned, "0", "0")).message).toMatch(
      /1 item still needs someone/,
    );

    unassigned[0].assignees = { "user-a": true };
    expect(draftCompleteness(unassigned, draftTotals(unassigned, "0", "0")).ok).toBe(true);
  });
});

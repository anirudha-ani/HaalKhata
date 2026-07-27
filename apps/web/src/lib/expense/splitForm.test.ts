/** Unit tests for the expense form's pure split helpers. */

import { describe, expect, it } from "vitest";
import {
  buildItemsPayload,
  buildSplitSpecs,
  checkItemized,
  checkSplit,
  includeInEveryItem,
  itemizedTotals,
  percentOfItems,
  shareEveryItemWith,
  type DraftLineItem,
} from "@/lib/expense/splitForm";

/**
 * Builds a draft line item with sensible defaults for the fields a test
 * doesn't care about.
 *
 * @param overrides - Fields to override on the default item.
 * @returns A draft line item.
 */
function draftItem(overrides: Partial<DraftLineItem> = {}): DraftLineItem {
  return {
    key: "key-1",
    name: "Pizza",
    total: "10.00",
    assignees: { alice: 1 },
    ...overrides,
  };
}

describe("itemizedTotals", () => {
  it("sums items and adds tax and tip", () => {
    const items = [draftItem({ total: "10.00" }), draftItem({ key: "key-2", total: "5.50" })];
    expect(itemizedTotals(items, 120, 300)).toEqual({
      itemsTotalCents: 1550,
      totalCents: 1970,
    });
  });

  it("treats unparseable amounts as zero", () => {
    expect(itemizedTotals([draftItem({ total: "" })], 0, 0).itemsTotalCents).toBe(0);
  });
});

describe("checkItemized", () => {
  it("accepts a priced, fully assigned draft", () => {
    expect(checkItemized([draftItem()]).ok).toBe(true);
  });

  it("rejects an empty draft", () => {
    const check = checkItemized([]);
    expect(check.ok).toBe(false);
    expect(check.message).toBe("add at least one item");
  });

  it("rejects items with no amount", () => {
    const check = checkItemized([draftItem({ total: "" })]);
    expect(check.ok).toBe(false);
    expect(check.message).toBe("1 item needs an amount");
  });

  it("rejects items nobody is assigned to", () => {
    const check = checkItemized([draftItem({ assignees: {} })]);
    expect(check.ok).toBe(false);
    expect(check.message).toBe("1 item is unassigned");
  });

  it("pluralizes the unassigned message", () => {
    const check = checkItemized([
      draftItem({ assignees: {} }),
      draftItem({ key: "key-2", assignees: {} }),
    ]);
    expect(check.message).toBe("2 items are unassigned");
  });
});

describe("buildItemsPayload", () => {
  it("carries per-person weights through unchanged", () => {
    const [item] = buildItemsPayload([draftItem({ assignees: { alice: 2, bobby: 1 } })]);
    expect(item.assignments).toEqual([
      { userId: "alice", weight: 2 },
      { userId: "bobby", weight: 1 },
    ]);
    expect(item.totalCents).toBe(1000);
  });

  it("drops zero-weight assignees and defaults a blank name", () => {
    const [item] = buildItemsPayload([
      draftItem({ name: "   ", assignees: { alice: 1, bobby: 0 } }),
    ]);
    expect(item.name).toBe("Item");
    expect(item.assignments).toEqual([{ userId: "alice", weight: 1 }]);
  });
});

describe("itemized mode in the shared split helpers", () => {
  const state = {
    splitType: "itemized" as const,
    totalCents: 1000,
    participantIds: ["alice"],
    inputs: {},
  };

  it("checkSplit defers to checkItemized instead of validating participants", () => {
    expect(checkSplit({ ...state, participantIds: [] }).ok).toBe(true);
  });

  it("buildSplitSpecs sends no per-person specs", () => {
    expect(buildSplitSpecs(state)).toEqual([]);
  });
});

describe("includeInEveryItem", () => {
  it("puts a newcomer on every line without disturbing existing weights", () => {
    const items = [
      draftItem({ key: "a", assignees: { alice: 1 } }),
      draftItem({ key: "b", assignees: { alice: 2, bobby: 1 } }),
    ];
    const next = includeInEveryItem(items, "carol");
    expect(next[0].assignees).toEqual({ alice: 1, carol: 1 });
    expect(next[1].assignees).toEqual({ alice: 2, bobby: 1, carol: 1 });
  });

  it("is the reason a receipt scanned before the cast still splits", () => {
    // Scan first (only you on the expense), pick people after — every parsed
    // line has to pick the newcomer up, or they owe nothing.
    const scanned = [draftItem({ key: "a", assignees: { alice: 1 } })];
    expect(checkItemized(scanned).ok).toBe(true);
    const shared = includeInEveryItem(scanned, "bobby");
    expect(Object.keys(shared[0].assignees).sort()).toEqual(["alice", "bobby"]);
  });

  it("does not demote somebody who already had a bigger share", () => {
    const next = includeInEveryItem([draftItem({ assignees: { alice: 3 } })], "alice");
    expect(next[0].assignees.alice).toBe(3);
  });

  it("leaves the original items untouched", () => {
    const items = [draftItem({ assignees: { alice: 1 } })];
    includeInEveryItem(items, "bobby");
    expect(items[0].assignees).toEqual({ alice: 1 });
  });
});

describe("shareEveryItemWith", () => {
  it("replaces the whole cast rather than merging into it", () => {
    const items = [draftItem({ assignees: { alice: 1, bobby: 2 } })];
    expect(shareEveryItemWith(items, ["carol", "dave"])[0].assignees).toEqual({
      carol: 1,
      dave: 1,
    });
  });

  it("ignores duplicates and blank ids", () => {
    const next = shareEveryItemWith([draftItem()], ["carol", "carol", ""]);
    expect(next[0].assignees).toEqual({ carol: 1 });
  });

  it("leaves an empty roster with nothing assigned, which checkItemized rejects", () => {
    const next = shareEveryItemWith([draftItem()], []);
    expect(next[0].assignees).toEqual({});
    expect(checkItemized(next).ok).toBe(false);
  });

  it("gives each item its own assignee object, so editing one does not edit the rest", () => {
    const next = shareEveryItemWith([draftItem({ key: "a" }), draftItem({ key: "b" })], ["carol"]);
    next[0].assignees.carol = 5;
    expect(next[1].assignees.carol).toBe(1);
  });
});

describe("percentOfItems", () => {
  it("reports an add-on against the pre-tax subtotal", () => {
    expect(percentOfItems(890, 10000)).toBe("8.9%");
  });

  it("agrees with the tip presets, which use the same base", () => {
    // applyTipPercent(18) on a 40.00 subtotal writes 7.20; the readout beside
    // it has to say 18%, not 15.3% (which is what measuring against the
    // 47.20 grand total would give).
    const subtotal = 4000;
    const tipCents = (subtotal * 18) / 100;
    expect(percentOfItems(tipCents, subtotal)).toBe("18%");
  });

  it("keeps one decimal for the rates that are not round", () => {
    expect(percentOfItems(888, 10000)).toBe("8.9%");
    expect(percentOfItems(1000, 10000)).toBe("10%");
  });

  it("shows nothing when there is nothing to compare against", () => {
    expect(percentOfItems(500, 0)).toBe("");
    expect(percentOfItems(0, 10000)).toBe("");
    expect(percentOfItems(-100, 10000)).toBe("");
  });

  it("does not hide a tax bigger than the bill", () => {
    expect(percentOfItems(20000, 10000)).toBe("200%");
  });
});

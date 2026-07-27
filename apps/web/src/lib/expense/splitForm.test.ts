/** Unit tests for the expense form's pure split helpers. */

import { describe, expect, it } from "vitest";
import {
  buildItemsPayload,
  buildSplitSpecs,
  checkItemized,
  checkSplit,
  itemizedTotals,
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

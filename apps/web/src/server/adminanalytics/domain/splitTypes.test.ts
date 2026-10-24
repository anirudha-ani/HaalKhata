/** Tests for ordering expense counts by split type. */

import { describe, expect, it } from "vitest";
import { rankSplitTypes } from "./splitTypes";

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

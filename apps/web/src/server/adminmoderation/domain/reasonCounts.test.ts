/** Tests for ranking report reasons. */

import { describe, expect, it } from "vitest";
import { rankReasons } from "./reasonCounts";

describe("rankReasons", () => {
  it("counts each reason and puts the most given first", () => {
    expect(rankReasons(["spam", "harassment", "spam"])).toEqual([
      { reason: "spam", count: 2 },
      { reason: "harassment", count: 1 },
    ]);
  });

  it("breaks ties in the order the report dialog offers the reasons", () => {
    expect(rankReasons(["other", "spam", "hate"])).toEqual([
      { reason: "hate", count: 1 },
      { reason: "spam", count: 1 },
      { reason: "other", count: 1 },
    ]);
  });

  it("keeps a reason it does not know, after the known ones", () => {
    expect(rankReasons(["mystery", "sexual"])).toEqual([
      { reason: "sexual", count: 1 },
      { reason: "mystery", count: 1 },
    ]);
  });

  it("returns nothing for no reports", () => {
    expect(rankReasons([])).toEqual([]);
  });
});

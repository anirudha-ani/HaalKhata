/** Tests for the itemized summary's warning sentences. */

import { describe, expect, it } from "vitest";
import { itemizedWarnings } from "./itemizedWarnings";

describe("itemizedWarnings", () => {
  it("says nothing when every priced line has someone on it", () => {
    expect(
      itemizedWarnings(
        [
          { total: "9.00", assignees: { you: 1, ani: 1 } },
          { total: "14.00", assignees: { adnan: 2 } },
        ],
        "USD",
      ),
    ).toEqual([]);
  });

  it("adds up the money on lines nobody is on", () => {
    expect(
      itemizedWarnings(
        [
          { total: "7.00", assignees: {} },
          { total: "3.50", assignees: { ani: 0 } },
          { total: "5.00", assignees: { you: 1 } },
        ],
        "USD",
      ),
    ).toEqual(["$10.50 unassigned"]);
  });

  it("counts lines with no usable amount, with the right grammar", () => {
    expect(itemizedWarnings([{ total: "", assignees: { you: 1 } }], "USD")).toEqual([
      "1 item needs an amount",
    ]);
    expect(
      itemizedWarnings(
        [
          { total: "", assignees: { you: 1 } },
          { total: "0", assignees: { you: 1 } },
        ],
        "USD",
      ),
    ).toEqual(["2 items need an amount"]);
  });

  it("reports both problems, unassigned money first", () => {
    expect(
      itemizedWarnings(
        [
          { total: "7.00", assignees: {} },
          { total: "abc", assignees: { you: 1 } },
        ],
        "USD",
      ),
    ).toEqual(["$7.00 unassigned", "1 item needs an amount"]);
  });
});

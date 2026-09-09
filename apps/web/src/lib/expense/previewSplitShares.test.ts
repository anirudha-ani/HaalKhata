/** Tests for the per-person preview of the non-itemized split modes. */

import { describe, expect, it } from "vitest";
import { previewSplitShares, type SplitFormState } from "./splitForm";

const base: Omit<SplitFormState, "splitType" | "totalCents"> = {
  participantIds: ["you", "adnan", "ani"],
  inputs: {},
  currency: "USD",
};

describe("previewSplitShares", () => {
  it("divides an equal split with the same rounding the server uses", () => {
    expect(previewSplitShares({ ...base, splitType: "equal", totalCents: 1000 })).toEqual({
      you: 334,
      adnan: 333,
      ani: 333,
    });
  });

  it("reads percent and shares inputs as typed", () => {
    expect(
      previewSplitShares({
        ...base,
        splitType: "percent",
        totalCents: 1000,
        inputs: { you: "50", adnan: "25", ani: "25" },
      }),
    ).toEqual({ you: 500, adnan: 250, ani: 250 });
    expect(
      previewSplitShares({
        ...base,
        splitType: "shares",
        totalCents: 900,
        inputs: { you: "2", adnan: "1", ani: "0" },
      }),
    ).toEqual({ you: 600, adnan: 300, ani: 0 });
  });

  it("returns nothing while the draft cannot be allocated yet", () => {
    expect(previewSplitShares({ ...base, splitType: "equal", totalCents: null })).toEqual({});
    expect(previewSplitShares({ ...base, splitType: "itemized", totalCents: 1000 })).toEqual({});
    expect(
      previewSplitShares({ ...base, splitType: "percent", totalCents: 1000, inputs: { you: "10" } }),
    ).toEqual({});
  });
});

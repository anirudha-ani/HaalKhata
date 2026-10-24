/** Tests for the one-line summary of report reasons. */

import { describe, expect, it } from "vitest";
import { reasonsLine } from "./reasonsLine";

describe("reasonsLine", () => {
  it("names each reason, counting the ones given more than once", () => {
    expect(
      reasonsLine([
        { reason: "spam", count: 2 },
        { reason: "harassment", count: 1 },
      ]),
    ).toBe("Spam or fraud ×2 · Harassment or threats");
  });

  it("is empty when there are no reasons", () => {
    expect(reasonsLine([])).toBe("");
  });
});

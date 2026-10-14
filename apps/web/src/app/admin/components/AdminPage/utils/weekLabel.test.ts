/** Tests for the trend chart's week labels. */

import { describe, expect, it } from "vitest";
import { weekLabel } from "./weekLabel";

describe("weekLabel", () => {
  it("names the day that was written, whatever the timezone", () => {
    const expected = new Date(2026, 9, 5).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
    expect(weekLabel("2026-10-05")).toBe(expected);
  });

  it("returns anything that is not a day untouched", () => {
    expect(weekLabel("soon")).toBe("soon");
  });
});

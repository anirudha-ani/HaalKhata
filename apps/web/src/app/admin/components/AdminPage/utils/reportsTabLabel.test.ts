/** Tests for the report queue's switch label. */

import { describe, expect, it } from "vitest";
import { reportsTabLabel } from "./reportsTabLabel";

describe("reportsTabLabel", () => {
  it("says nothing about a count when nothing waits", () => {
    expect(reportsTabLabel(0, false)).toBe("Reports");
  });

  it("shows how many wait", () => {
    expect(reportsTabLabel(3, false)).toBe("Reports (3)");
  });

  it("says when there are more than the list holds", () => {
    expect(reportsTabLabel(100, true)).toBe("Reports (100+)");
  });
});

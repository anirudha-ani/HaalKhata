/** Tests for naming report reasons. */

import { describe, expect, it } from "vitest";
import { reasonLabel } from "./reasonLabel";

describe("reasonLabel", () => {
  it("uses the report dialog's own words", () => {
    expect(reasonLabel("harassment")).toBe("Harassment or threats");
    expect(reasonLabel("spam")).toBe("Spam or fraud");
  });

  it("shows a reason it does not know as it is, rather than nothing", () => {
    expect(reasonLabel("something-new")).toBe("something-new");
  });
});

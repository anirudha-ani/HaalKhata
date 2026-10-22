/** Tests for the group type lookups. */

import { describe, expect, it } from "vitest";
import { groupEmoji, groupTypeLabel } from "./groupTypes";

describe("groupTypeLabel", () => {
  it("names every known type by its label", () => {
    expect(groupTypeLabel("trip")).toBe("Trip");
    expect(groupTypeLabel("couple")).toBe("Couple");
  });

  it("raises only the first letter of a type it does not know", () => {
    expect(groupTypeLabel("roommates")).toBe("Roommates");
    expect(groupTypeLabel("")).toBe("");
  });
});

describe("groupEmoji", () => {
  it("falls back to the ledger for a type it does not know", () => {
    expect(groupEmoji("trip")).toBe("✈️");
    expect(groupEmoji("roommates")).toBe("📒");
  });
});

/** Tests for fail-closed activity-feed navigation paths. */

import { describe, expect, it } from "vitest";
import { safeActivityPath } from "./activityPath";

describe("safeActivityPath", () => {
  it.each([
    "/activity",
    "/friends",
    "/expenses/018f4f24-95a7-7abc-8def-0123456789ab",
    "/groups/group_123",
    "/friends/user-123",
  ])("accepts the allowlisted in-app path %s", (path) => {
    expect(safeActivityPath(path)).toBe(path);
  });

  it.each([
    "https://attacker.example/",
    "//attacker.example/",
    "javascript:alert(1)",
    "/\\attacker.example/",
    "/groups/../account",
    "/groups/id?next=https://attacker.example",
    "/groups/id#fragment",
    "/groups/%2f%2fattacker.example",
    "/unknown/id",
    "",
  ])("replaces the unsafe or unknown path %s", (path) => {
    expect(safeActivityPath(path)).toBe("/activity");
  });

  it("supports a known-safe caller fallback", () => {
    expect(safeActivityPath("https://attacker.example", "/friends")).toBe("/friends");
  });
});

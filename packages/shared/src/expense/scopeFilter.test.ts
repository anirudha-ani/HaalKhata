/** Unit tests for the all-expenses page's scope filter and empty message. */

import { describe, expect, it } from "vitest";
import {
  FIXED_SCOPE_OPTIONS,
  isGroupScope,
  matchesScopeFilter,
  noExpensesMessage,
  scopePickerGroups,
} from "./scopeFilter";

describe("matchesScopeFilter", () => {
  it("shows everything under 'all'", () => {
    expect(matchesScopeFilter("", "all")).toBe(true);
    expect(matchesScopeFilter("grp-1", "all")).toBe(true);
  });

  it("keeps only group-less expenses under 'oneoff'", () => {
    // The page's reason to exist: one-off expenses had no view of their own.
    expect(matchesScopeFilter("", "oneoff")).toBe(true);
    expect(matchesScopeFilter("grp-1", "oneoff")).toBe(false);
  });

  it("keeps only the named group's expenses under a group id", () => {
    expect(matchesScopeFilter("grp-1", "grp-1")).toBe(true);
    expect(matchesScopeFilter("grp-2", "grp-1")).toBe(false);
    expect(matchesScopeFilter("", "grp-1")).toBe(false);
  });
});

describe("noExpensesMessage", () => {
  it("never renders empty quotes", () => {
    // The exact regression the groups page shipped: an empty query reported
    // as `matches “”`. No combination of states may produce it here.
    for (const filter of ["all", "oneoff", "grp-1"]) {
      expect(noExpensesMessage("", filter, "Goa")).not.toContain("“”");
    }
  });

  it("names the search term when searching", () => {
    expect(noExpensesMessage("chai", "all", "")).toBe("No expenses match “chai”.");
  });

  it("names the scope when it filters", () => {
    expect(noExpensesMessage("", "oneoff", "")).toBe("No expenses outside your groups.");
    expect(noExpensesMessage("", "grp-1", "Goa Trip")).toBe("No expenses in Goa Trip.");
  });

  it("names both when both narrow the list", () => {
    expect(noExpensesMessage("chai", "oneoff", "")).toBe(
      "No expenses match “chai” outside your groups.",
    );
  });

  it("falls back to a plain message with nothing filtering", () => {
    expect(noExpensesMessage("", "all", "")).toBe("No expenses yet.");
  });

  it("survives a group id with no resolvable name", () => {
    expect(noExpensesMessage("", "grp-gone", "")).toBe("No expenses in that group.");
  });
});

describe("isGroupScope", () => {
  it("is false for the two fixed scopes and true for a group id", () => {
    expect(isGroupScope("all")).toBe(false);
    expect(isGroupScope("oneoff")).toBe(false);
    expect(isGroupScope("9b2f6d1e-0c3a-4f5b-8e7d-1a2b3c4d5e6f")).toBe(true);
  });

  it("agrees with the chips: every fixed option is a non-group scope", () => {
    expect(FIXED_SCOPE_OPTIONS.every((option) => !isGroupScope(option.value))).toBe(true);
  });
});

describe("scopePickerGroups", () => {
  const groups = [
    { id: "grp-1", name: "Goa trip 2026" },
    { id: "grp-2", name: "Flat 4B" },
    { id: "grp-3", name: "Goa dive club" },
  ];

  it("lists every group, in the order given, while nothing is typed", () => {
    expect(scopePickerGroups(groups, "")).toEqual(groups);
    expect(scopePickerGroups(groups, "   ")).toEqual(groups);
  });

  it("narrows by name, ignoring case", () => {
    expect(scopePickerGroups(groups, "GOA").map((group) => group.id)).toEqual(["grp-1", "grp-3"]);
  });

  it("needs every typed word to match", () => {
    expect(scopePickerGroups(groups, "goa dive").map((group) => group.id)).toEqual(["grp-3"]);
  });

  it("returns nothing when no name matches", () => {
    expect(scopePickerGroups(groups, "lisbon")).toEqual([]);
  });
});

/** Unit tests for the all-expenses page's scope filter and empty message. */

import { describe, expect, it } from "vitest";
import { ExpenseListPart } from "@haalkhata/protogen/expense/v1/expense_pb";
import {
  FIXED_SCOPE_OPTIONS,
  isGroupScope,
  noExpensesMessage,
  scopeFilterRequest,
  scopePickerGroups,
} from "./scopeFilter";

describe("scopeFilterRequest", () => {
  it("reads the whole list under 'all'", () => {
    expect(scopeFilterRequest("all")).toEqual({ part: ExpenseListPart.UNSPECIFIED, partGroupId: "" });
  });

  it("asks the server for group-less expenses under 'oneoff'", () => {
    // The page's reason to exist: one-off expenses had no view of their own.
    expect(scopeFilterRequest("oneoff")).toEqual({ part: ExpenseListPart.ONE_OFF, partGroupId: "" });
  });

  it("asks for the named group's under a group id", () => {
    expect(scopeFilterRequest("grp-1")).toEqual({ part: ExpenseListPart.GROUP, partGroupId: "grp-1" });
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

  it("says a search read only what is loaded while older pages remain", () => {
    expect(noExpensesMessage("chai", "all", "", true)).toBe(
      "None of the expenses loaded so far match “chai”. Show more to search further back.",
    );
    expect(noExpensesMessage("chai", "oneoff", "", true)).toBe(
      "None of the expenses loaded so far match “chai” outside your groups. Show more to search further back.",
    );
    // A scope is applied by the server: nothing loaded means nothing there.
    expect(noExpensesMessage("", "oneoff", "", true)).toBe("No expenses outside your groups.");
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

/** Regression coverage for group subsets, payer cleanup, and restoring expense participants. */

import { describe, expect, it } from "vitest";
import { initialExpensePeopleIds, resolveExpensePeople, toggleExpensePerson, type ExpensePeopleState } from "./participants";
import { computeSplits } from "./splits";

const currentUser = { id: "user-self" };
const roster = [currentUser, { id: "user-alex" }, { id: "user-blair" }];
const rosterIds = roster.map((person) => person.id);

/**
 * Makes an untouched group expense with optional money fields for a scenario.
 * @param overrides - Fields needed by the scenario.
 * @returns The group's default participant state.
 */
function groupState(overrides: Partial<ExpensePeopleState> = {}): ExpensePeopleState {
  return {
    personIds: null,
    checked: null,
    splitInputs: {},
    payerAmounts: {},
    singlePayerId: currentUser.id,
    ...overrides,
  };
}

describe("expense participant selection", () => {
  it("starts a new group expense with the roster, then splits only among the remaining people", () => {
    expect(initialExpensePeopleIds(null, currentUser.id, {})).toBeNull();
    expect(resolveExpensePeople(currentUser, roster, null)).toEqual(roster);

    const next = toggleExpensePerson(groupState(), rosterIds, "user-alex", currentUser.id);
    const selected = resolveExpensePeople(currentUser, roster, next.personIds);
    expect(computeSplits("equal", 1001, selected.map((person) => ({ userId: person.id })))).toEqual([
      { userId: currentUser.id, owedCents: 501 },
      { userId: "user-blair", owedCents: 500 },
    ]);
  });

  it("clears a removed member's split inputs and paid amount without changing other people's values", () => {
    const original = groupState({
      checked: { "user-self": false, "user-alex": true, "user-blair": true },
      splitInputs: { "user-alex": "75", "user-blair": "25" },
      payerAmounts: { "user-self": "8.00", "user-alex": "2.00" },
    });
    const next = toggleExpensePerson(original, rosterIds, "user-alex", currentUser.id);

    expect(next.checked).toEqual({ "user-self": false, "user-blair": true });
    expect(next.splitInputs).toEqual({ "user-blair": "25" });
    expect(next.payerAmounts).toEqual({ "user-self": "8.00" });
    expect(original.payerAmounts["user-alex"]).toBe("2.00");
  });

  it("replaces a removed single payer with the signed-in person", () => {
    const next = toggleExpensePerson(
      groupState({ singlePayerId: "user-alex" }), rosterIds, "user-alex", currentUser.id,
    );
    expect(next.singlePayerId).toBe(currentUser.id);
  });

  it("restores a member to the split without restoring stale paid or split amounts", () => {
    const removed = toggleExpensePerson(groupState({
      checked: { "user-self": false, "user-alex": true, "user-blair": true },
      splitInputs: { "user-alex": "50" },
      payerAmounts: { "user-alex": "10.00" },
    }), rosterIds, "user-alex", currentUser.id);
    const remainingIds = resolveExpensePeople(currentUser, roster, removed.personIds).map((person) => person.id);
    const restored = toggleExpensePerson(removed, remainingIds, "user-alex", currentUser.id);

    expect(resolveExpensePeople(currentUser, roster, restored.personIds)).toEqual(roster);
    expect(restored.checked).toEqual({ "user-self": false, "user-alex": true, "user-blair": true });
    expect(restored.splitInputs).toEqual({});
    expect(restored.payerAmounts).toEqual({});
  });

  it("reopens a saved group subset including a member who paid but did not owe a share", () => {
    const selectedIds = initialExpensePeopleIds(
      { "user-self": true, "user-blair": true }, "user-alex", { "user-alex": "10.00" },
    );
    const expandedRoster = [...roster, { id: "user-casey" }];
    expect(resolveExpensePeople(currentUser, expandedRoster, selectedIds)).toEqual(roster);

    const subset = initialExpensePeopleIds({ "user-blair": true }, currentUser.id, {});
    expect(resolveExpensePeople(currentUser, expandedRoster, subset)).toEqual([
      currentUser, { id: "user-blair" },
    ]);
  });

  it("also removes and restores someone on a one-off expense", () => {
    const initial = groupState({ personIds: ["user-alex"] });
    const removed = toggleExpensePerson(initial, [currentUser.id, "user-alex"], "user-alex", currentUser.id);
    expect(removed.personIds).toEqual([]);
    const restored = toggleExpensePerson(removed, [currentUser.id], "user-alex", currentUser.id);
    expect(restored.personIds).toEqual(["user-alex"]);
  });

  it("keeps the signed-in person pinned, even when the roster does not include them", () => {
    const original = groupState();
    expect(toggleExpensePerson(original, rosterIds, currentUser.id, currentUser.id)).toBe(original);
    expect(resolveExpensePeople(currentUser, [{ id: "user-alex" }], [])).toEqual([currentUser]);
  });
});

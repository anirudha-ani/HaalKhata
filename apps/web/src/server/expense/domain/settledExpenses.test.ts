/** Unit tests for which expenses count as settled for the viewer. */

import { describe, expect, it } from "vitest";
import { settledExpenseIds } from "./settledExpenses";

const VIEWER = "me";

describe("settledExpenseIds", () => {
  it("marks a group's expenses settled only when the viewer's group net is zero", () => {
    const expenses = [
      { id: "paid-trip", groupId: "trip-done", currency: "USD", participantIds: [VIEWER, "ana"] },
      { id: "open-trip", groupId: "trip-open", currency: "USD", participantIds: [VIEWER, "ana"] },
    ];
    const nets = new Map([
      ["trip-done", 0],
      ["trip-open", -2500],
    ]);
    expect(settledExpenseIds(expenses, VIEWER, nets, new Map())).toEqual(["paid-trip"]);
  });

  it("never singles out one expense of a group that still owes", () => {
    // The ledger holds one net per scope, not per-expense earmarks. Marking
    // "the old one" settled while the group owes would be an attribution the
    // ledger never made.
    const expenses = [
      { id: "older", groupId: "trip", currency: "USD", participantIds: [VIEWER, "ana"] },
      { id: "newer", groupId: "trip", currency: "USD", participantIds: [VIEWER, "ana"] },
    ];
    expect(settledExpenseIds(expenses, VIEWER, new Map([["trip", 100]]), new Map())).toEqual([]);
  });

  it("marks a one-off settled when the pair's one-off balance is zero", () => {
    const expenses = [
      { id: "taxi", groupId: "", currency: "USD", participantIds: [VIEWER, "ana"] },
      { id: "chai", groupId: "", currency: "USD", participantIds: [VIEWER, "bob"] },
    ];
    const pairNets = new Map([
      ["ana|USD", 0],
      ["bob|USD", -450],
    ]);
    expect(settledExpenseIds(expenses, VIEWER, new Map(), pairNets)).toEqual(["taxi"]);
  });

  it("keeps a three-person one-off pending while any pair still owes", () => {
    const expenses = [
      { id: "dinner", groupId: "", currency: "USD", participantIds: [VIEWER, "ana", "bob"] },
    ];
    const oneSettledOneNot = new Map([
      ["ana|USD", 0],
      ["bob|USD", 300],
    ]);
    expect(settledExpenseIds(expenses, VIEWER, new Map(), oneSettledOneNot)).toEqual([]);
    const bothSettled = new Map([
      ["ana|USD", 0],
      ["bob|USD", 0],
    ]);
    expect(settledExpenseIds(expenses, VIEWER, new Map(), bothSettled)).toEqual(["dinner"]);
  });

  it("treats a missing net as zero, not as pending", () => {
    // A counterparty absent from the net map has no ledger with the viewer at
    // all — nothing pending is exactly what that means.
    const expenses = [{ id: "solo", groupId: "", currency: "USD", participantIds: [VIEWER, "ghost"] }];
    expect(settledExpenseIds(expenses, VIEWER, new Map(), new Map())).toEqual(["solo"]);
  });
});

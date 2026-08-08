/** Unit tests for how a payment is split across the scopes holding the debt. */

import { describe, expect, it } from "vitest";
import { allocateSettlement } from "./settlementAllocation";

describe("allocateSettlement", () => {
  it("records a payment against the group holding the debt, not a scope of its own", () => {
    // The double-count bug in one line: the debt lives in a group, the payment
    // was made from the friends tab. It must land IN the group, or the group
    // keeps demanding money that was already paid.
    expect(allocateSettlement([{ groupId: "goa", owedCents: 5000 }], 5000)).toEqual([
      { groupId: "goa", amountCents: 5000 },
    ]);
  });

  it("pays the one-off slate before touching any group", () => {
    const portions = allocateSettlement(
      [
        { groupId: "goa", owedCents: 4000 },
        { groupId: null, owedCents: 1000 },
      ],
      3000,
    );
    expect(portions).toEqual([
      { groupId: null, amountCents: 1000 },
      { groupId: "goa", amountCents: 2000 },
    ]);
  });

  it("fills larger group debts first, ties broken by group id", () => {
    const portions = allocateSettlement(
      [
        { groupId: "small", owedCents: 100 },
        { groupId: "zeta", owedCents: 700 },
        { groupId: "alpha", owedCents: 700 },
      ],
      1400,
    );
    // alpha before zeta at equal size — determinism is the point: the same
    // payment must always land the same way, or retries and replays diverge.
    expect(portions).toEqual([
      { groupId: "alpha", amountCents: 700 },
      { groupId: "zeta", amountCents: 700 },
    ]);
  });

  it("covers a partial payment without inventing a remainder portion", () => {
    const portions = allocateSettlement([{ groupId: "goa", owedCents: 5000 }], 2000);
    expect(portions).toEqual([{ groupId: "goa", amountCents: 2000 }]);
  });

  it("portions always sum to the payment when the debts cover it", () => {
    const scopes = [
      { groupId: null, owedCents: 313 },
      { groupId: "second", owedCents: 1289 },
      { groupId: "first", owedCents: 77 },
    ];
    for (const amount of [1, 313, 314, 1679, 1600]) {
      const total = allocateSettlement(scopes, amount).reduce(
        (running, portion) => running + portion.amountCents,
        0,
      );
      expect(total).toBe(amount);
    }
  });

  it("never emits a zero or negative portion", () => {
    const portions = allocateSettlement(
      [
        { groupId: null, owedCents: 500 },
        { groupId: "goa", owedCents: 500 },
      ],
      500,
    );
    expect(portions).toEqual([{ groupId: null, amountCents: 500 }]);
  });

  it("leaves the caller's scope list untouched", () => {
    const scopes = [
      { groupId: "b", owedCents: 100 },
      { groupId: "a", owedCents: 200 },
    ];
    allocateSettlement(scopes, 300);
    expect(scopes.map((scope) => scope.groupId)).toEqual(["b", "a"]);
  });
});

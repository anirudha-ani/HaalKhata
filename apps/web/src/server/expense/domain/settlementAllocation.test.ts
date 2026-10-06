/** Unit tests for how a payment is split across the scopes holding the debt. */

import { describe, expect, it } from "vitest";
import { allocateSettlement, planNetSettlement } from "./settlementAllocation";

describe("allocateSettlement", () => {
  it("records a payment against the group holding the debt, not a scope of its own", () => {
    // The double-count bug in one line: the debt lives in a group, the payment
    // was made from the friends tab. It must land IN the group, or the group
    // keeps demanding money that was already paid.
    expect(allocateSettlement([{ groupId: "goa", currency: "USD", owedCents: 5000 }], 5000)).toEqual([
      { groupId: "goa", currency: "USD", amountCents: 5000 },
    ]);
  });

  it("pays the one-off slate before touching any group", () => {
    const portions = allocateSettlement(
      [
        { groupId: "goa", currency: "USD", owedCents: 4000 },
        { groupId: null, currency: "USD", owedCents: 1000 },
      ],
      3000,
    );
    expect(portions).toEqual([
      { groupId: null, currency: "USD", amountCents: 1000 },
      { groupId: "goa", currency: "USD", amountCents: 2000 },
    ]);
  });

  it("fills larger group debts first, ties broken by group id", () => {
    const portions = allocateSettlement(
      [
        { groupId: "small", currency: "USD", owedCents: 100 },
        { groupId: "zeta", currency: "USD", owedCents: 700 },
        { groupId: "alpha", currency: "USD", owedCents: 700 },
      ],
      1400,
    );
    // alpha before zeta at equal size — determinism is the point: the same
    // payment must always land the same way, or retries and replays diverge.
    expect(portions).toEqual([
      { groupId: "alpha", currency: "USD", amountCents: 700 },
      { groupId: "zeta", currency: "USD", amountCents: 700 },
    ]);
  });

  it("covers a partial payment without inventing a remainder portion", () => {
    const portions = allocateSettlement([{ groupId: "goa", currency: "USD", owedCents: 5000 }], 2000);
    expect(portions).toEqual([{ groupId: "goa", currency: "USD", amountCents: 2000 }]);
  });

  it("portions always sum to the payment when the debts cover it", () => {
    const scopes = [
      { groupId: null, currency: "USD", owedCents: 313 },
      { groupId: "second", currency: "USD", owedCents: 1289 },
      { groupId: "first", currency: "USD", owedCents: 77 },
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
        { groupId: null, currency: "USD", owedCents: 500 },
        { groupId: "goa", currency: "USD", owedCents: 500 },
      ],
      500,
    );
    expect(portions).toEqual([{ groupId: null, currency: "USD", amountCents: 500 }]);
  });

  it("leaves the caller's scope list untouched", () => {
    const scopes = [
      { groupId: "b", currency: "USD", owedCents: 100 },
      { groupId: "a", currency: "USD", owedCents: 200 },
    ];
    allocateSettlement(scopes, 300);
    expect(scopes.map((scope) => scope.groupId)).toEqual(["b", "a"]);
  });
});

describe("planNetSettlement", () => {
  // The reported case: 223.77 owed outside groups, 195.51 and 15.57 owed back
  // inside two, so 12.69 is all the cash that should move.
  const owing = [{ groupId: null, currency: "USD", owedCents: 22377 }];
  const opposing = [
    { groupId: "catskills", currency: "USD", owedCents: 19551 },
    { groupId: "reunion", currency: "USD", owedCents: 1557 },
  ];
  const totalOf = (portions: { amountCents: number }[]) =>
    portions.reduce((running, portion) => running + portion.amountCents, 0);

  it("moves only the net in cash and cancels the rest where it lives", () => {
    const plan = planNetSettlement(owing, opposing, 1269);
    expect(plan.cash).toEqual([{ groupId: null, currency: "USD", amountCents: 1269 }]);
    expect(plan.offsetOwing).toEqual([{ groupId: null, currency: "USD", amountCents: 21108 }]);
    expect(plan.offsetOpposing).toEqual([
      { groupId: "catskills", currency: "USD", amountCents: 19551 },
      { groupId: "reunion", currency: "USD", amountCents: 1557 },
    ]);
  });

  it("leaves every scope at zero after a payment of the full net", () => {
    const plan = planNetSettlement(owing, opposing, 1269);
    // What the payer owed is covered by cash plus offsets...
    expect(totalOf(plan.cash) + totalOf(plan.offsetOwing)).toBe(22377);
    // ...and every opposing balance is cancelled exactly.
    expect(plan.offsetOpposing.map((portion) => portion.amountCents)).toEqual([19551, 1557]);
  });

  it("makes the two sets of offsets cancel, so no cash is invented", () => {
    for (const amountCents of [1, 600, 1269]) {
      const plan = planNetSettlement(owing, opposing, amountCents);
      expect(totalOf(plan.offsetOwing)).toBe(totalOf(plan.offsetOpposing));
      expect(totalOf(plan.cash)).toBe(amountCents);
    }
  });

  it("still clears the opposing balances on a partial payment, leaving the rest of the net owed", () => {
    const plan = planNetSettlement(owing, opposing, 600);
    expect(totalOf(plan.offsetOpposing)).toBe(21108);
    // 22377 owed - 600 cash - 21108 offset = 669 still owed: the net less the payment.
    expect(22377 - totalOf(plan.cash) - totalOf(plan.offsetOwing)).toBe(1269 - 600);
  });

  it("spreads cash and offsets over several owing scopes in allocation order", () => {
    const plan = planNetSettlement(
      [
        { groupId: null, currency: "USD", owedCents: 5000 },
        { groupId: "grp-a", currency: "USD", owedCents: 9000 },
        { groupId: "grp-b", currency: "USD", owedCents: 2000 },
      ],
      [{ groupId: "grp-c", currency: "USD", owedCents: 10000 }],
      6000,
    );
    // Cash fills the direct slate, then the largest group.
    expect(plan.cash).toEqual([
      { groupId: null, currency: "USD", amountCents: 5000 },
      { groupId: "grp-a", currency: "USD", amountCents: 1000 },
    ]);
    // Offsets take what cash did not reach: the rest of grp-a, then grp-b.
    expect(plan.offsetOwing).toEqual([
      { groupId: "grp-a", currency: "USD", amountCents: 8000 },
      { groupId: "grp-b", currency: "USD", amountCents: 2000 },
    ]);
    expect(plan.offsetOpposing).toEqual([{ groupId: "grp-c", currency: "USD", amountCents: 10000 }]);
  });

  it("is an ordinary payment when nothing points the other way", () => {
    const plan = planNetSettlement(owing, [], 5000);
    expect(plan).toEqual({
      cash: [{ groupId: null, currency: "USD", amountCents: 5000 }],
      offsetOwing: [],
      offsetOpposing: [],
    });
  });

  it("refuses to plan across currencies", () => {
    expect(() =>
      planNetSettlement(owing, [{ groupId: "lisbon", currency: "EUR", owedCents: 7599 }, ...opposing], 1269),
    ).toThrow(/more than one currency/);
  });
});

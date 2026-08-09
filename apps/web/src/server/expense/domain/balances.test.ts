/** Unit tests for the pure balance math: expense debts, pairwise netting, debt simplification. */

import { describe, expect, it } from "vitest";
import {
  expenseDebts,
  netBalances,
  pairwiseBalances,
  simplifyDebts,
} from "./balances";

describe("expenseDebts", () => {
  it("splits a single-payer expense into pairwise debts", () => {
    const debts = expenseDebts(
      [{ userId: "payer", amountCents: 300 }],
      [
        { userId: "payer", amountCents: 100 },
        { userId: "x", amountCents: 100 },
        { userId: "y", amountCents: 100 },
      ],
    );
    expect(debts).toEqual([
      { from: "x", to: "payer", amountCents: 100 },
      { from: "y", to: "payer", amountCents: 100 },
    ]);
  });

  it("handles multiple payers", () => {
    const debts = expenseDebts(
      [
        { userId: "a", amountCents: 600 },
        { userId: "b", amountCents: 400 },
      ],
      [
        { userId: "a", amountCents: 500 },
        { userId: "b", amountCents: 500 },
      ],
    );
    // b paid 400 but owes 500 → b owes a 100.
    expect(debts).toEqual([{ from: "b", to: "a", amountCents: 100 }]);
  });

  it("conserves money: debts equal total imbalance", () => {
    const debts = expenseDebts(
      [{ userId: "a", amountCents: 1000 }],
      [
        { userId: "b", amountCents: 700 },
        { userId: "c", amountCents: 300 },
      ],
    );
    expect(debts.reduce((runningTotal, debt) => runningTotal + debt.amountCents, 0)).toBe(1000);
  });
});

describe("pairwiseBalances + settlements", () => {
  it("a settlement reduces the debt and can zero it", () => {
    const debts = [{ from: "b", to: "a", amountCents: 500 }];
    expect(pairwiseBalances(debts, [{ from: "b", to: "a", amountCents: 200 }])).toEqual([
      { from: "b", to: "a", amountCents: 300 },
    ]);
    expect(pairwiseBalances(debts, [{ from: "b", to: "a", amountCents: 500 }])).toEqual([]);
  });

  it("overpaying flips the direction", () => {
    expect(
      pairwiseBalances(
        [{ from: "b", to: "a", amountCents: 100 }],
        [{ from: "b", to: "a", amountCents: 250 }],
      ),
    ).toEqual([{ from: "a", to: "b", amountCents: 150 }]);
  });

  it("nets opposite debts between the same pair", () => {
    expect(
      pairwiseBalances(
        [
          { from: "b", to: "a", amountCents: 400 },
          { from: "a", to: "b", amountCents: 150 },
        ],
        [],
      ),
    ).toEqual([{ from: "b", to: "a", amountCents: 250 }]);
  });
});

describe("simplifyDebts", () => {
  it("collapses a chain into a single payment", () => {
    // c owes b 100, b owes a 100 → c pays a 100 directly.
    const netByUser = netBalances([
      { from: "c", to: "b", amountCents: 100 },
      { from: "b", to: "a", amountCents: 100 },
    ]);
    expect(simplifyDebts(netByUser)).toEqual([{ from: "c", to: "a", amountCents: 100 }]);
  });

  it("preserves every participant's net position", () => {
    const debts = [
      { from: "b", to: "a", amountCents: 730 },
      { from: "c", to: "a", amountCents: 270 },
      { from: "c", to: "b", amountCents: 510 },
      { from: "d", to: "c", amountCents: 999 },
    ];
    const before = netBalances(debts);
    const after = netBalances(simplifyDebts(before));
    for (const [user, netCents] of before) {
      expect(after.get(user) ?? 0).toBe(netCents);
    }
  });

  it("uses at most participants − 1 payments", () => {
    const netByUser = netBalances([
      { from: "b", to: "a", amountCents: 100 },
      { from: "c", to: "a", amountCents: 100 },
      { from: "d", to: "b", amountCents: 50 },
      { from: "d", to: "c", amountCents: 50 },
    ]);
    expect(simplifyDebts(netByUser).length).toBeLessThanOrEqual(netByUser.size - 1);
  });

  it("returns nothing when everyone is settled", () => {
    expect(simplifyDebts(new Map())).toEqual([]);
    expect(
      simplifyDebts(
        new Map([
          ["a", 0],
          ["b", 0],
        ]),
      ),
    ).toEqual([]);
  });

  it("emits no zero edges and at most one edge per pair", () => {
    const edges = simplifyDebts(
      new Map([
        ["a", -1200],
        ["b", -800],
        ["c", 1200],
        ["d", 800],
      ]),
    );
    const seenPairs = new Set<string>();
    for (const edge of edges) {
      expect(edge.amountCents).toBeGreaterThan(0);
      const pairKey = `${edge.from}|${edge.to}`;
      expect(seenPairs.has(pairKey)).toBe(false);
      seenPairs.add(pairKey);
    }
  });

  it("breaks amount ties by user id, so the routing is stable across reads", () => {
    // Two identical debtors and one creditor: the same input must always
    // produce the same edges, because a guard validating a payment re-derives
    // this routing and must land on the edge the page proposed.
    expect(
      simplifyDebts(
        new Map([
          ["debtor-b", -500],
          ["debtor-a", -500],
          ["creditor", 1000],
        ]),
      ),
    ).toEqual([
      { from: "debtor-a", to: "creditor", amountCents: 500 },
      { from: "debtor-b", to: "creditor", amountCents: 500 },
    ]);
  });

  it("a payment along a simplified edge shrinks that edge, not somebody else's", () => {
    // The stability that makes partial settling safe: nets a −10/−4, c +14
    // route as a→c 10, b→c 4; a paying 6 leaves a→c 4 and b→c 4 untouched.
    const before = new Map([
      ["a", -1000],
      ["b", -400],
      ["c", 1400],
    ]);
    expect(simplifyDebts(before)).toEqual([
      { from: "a", to: "c", amountCents: 1000 },
      { from: "b", to: "c", amountCents: 400 },
    ]);
    const afterPartial = new Map([
      ["a", -400],
      ["b", -400],
      ["c", 800],
    ]);
    expect(simplifyDebts(afterPartial)).toEqual([
      { from: "a", to: "c", amountCents: 400 },
      { from: "b", to: "c", amountCents: 400 },
    ]);
  });
});

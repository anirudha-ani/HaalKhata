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
});

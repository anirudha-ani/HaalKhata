/** Unit tests for which listed expenses the viewer has paid back. */

import { describe, expect, it } from "vitest";
import { expensePaymentKey, repaidExpenseIds, type ListedExpenseMoney } from "./repaidExpenses";

const VIEWER = "me";

/**
 * A listed expense Ana paid, with the viewer's share as given.
 *
 * @param expenseId - Its id.
 * @param viewerShareCents - What the viewer owes on it.
 * @param deleted - Whether it has been deleted.
 * @returns The expense.
 */
function anaPaid(expenseId: string, viewerShareCents: number, deleted = false): ListedExpenseMoney {
  return {
    id: expenseId,
    deleted,
    payers: [{ userId: "ana", amountCents: viewerShareCents * 2 }],
    splits: [
      { userId: "ana", owedCents: viewerShareCents },
      { userId: VIEWER, owedCents: viewerShareCents },
    ],
  };
}

describe("repaidExpenseIds", () => {
  it("marks an expense once the payments for it cover the viewer's share", () => {
    const paid = new Map([
      [expensePaymentKey("dinner", "ana"), 1500],
      [expensePaymentKey("taxi", "ana"), 400],
    ]);
    expect(repaidExpenseIds([anaPaid("dinner", 1500), anaPaid("taxi", 1000)], VIEWER, paid)).toEqual(["dinner"]);
  });

  it("counts only payments made to the person the share is owed to", () => {
    const paid = new Map([[expensePaymentKey("dinner", "bob"), 1500]]);
    expect(repaidExpenseIds([anaPaid("dinner", 1500)], VIEWER, paid)).toEqual([]);
  });

  it("needs every payer paid back when the share is owed to two", () => {
    const twoPayers: ListedExpenseMoney = {
      id: "hotel",
      deleted: false,
      payers: [
        { userId: "ana", amountCents: 1500 },
        { userId: "bob", amountCents: 1500 },
      ],
      splits: [{ userId: VIEWER, owedCents: 3000 }],
    };
    const halfway = new Map([[expensePaymentKey("hotel", "ana"), 1500]]);
    expect(repaidExpenseIds([twoPayers], VIEWER, halfway)).toEqual([]);
    const both = new Map([...halfway, [expensePaymentKey("hotel", "bob"), 1500]]);
    expect(repaidExpenseIds([twoPayers], VIEWER, both)).toEqual(["hotel"]);
  });

  it("stays paid back after an edit makes the share smaller", () => {
    const paid = new Map([[expensePaymentKey("dinner", "ana"), 1500]]);
    expect(repaidExpenseIds([anaPaid("dinner", 1200)], VIEWER, paid)).toEqual(["dinner"]);
  });

  it("never marks an expense the viewer owes nothing on, or a deleted one", () => {
    const viewerPaid: ListedExpenseMoney = {
      id: "groceries",
      deleted: false,
      payers: [{ userId: VIEWER, amountCents: 2000 }],
      splits: [
        { userId: VIEWER, owedCents: 1000 },
        { userId: "ana", owedCents: 1000 },
      ],
    };
    const paid = new Map([[expensePaymentKey("gone", "ana"), 1500]]);
    expect(repaidExpenseIds([viewerPaid, anaPaid("gone", 1500, true)], VIEWER, paid)).toEqual([]);
  });
});

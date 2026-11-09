/** Unit tests for paying back one expense: the debts it leaves, what can be paid, and the wording. */

import { describe, expect, it } from "vitest";
import {
  billOverLimitMessage,
  billPayableCents,
  creditorsOnExpense,
  expensePaymentLine,
  owedOnExpense,
  payableOnExpense,
  readRepayment,
  repaymentState,
  type RepaymentLike,
} from "./repayment";
import { readSettlePositions } from "./settlePosition";

/** A $30 dinner Ana paid, split three ways between Ana, Bob and Chen. */
const DINNER = {
  payers: [{ userId: "ana", amountCents: 3000 }],
  splits: [
    { userId: "ana", owedCents: 1000 },
    { userId: "bob", owedCents: 1000 },
    { userId: "chen", owedCents: 1000 },
  ],
};

/**
 * A repayment with the given figures, owed to Ana.
 *
 * @param figures - What differs from a fresh, unpaid $10 share.
 * @returns The repayment.
 */
function repayment(figures: Partial<RepaymentLike>): RepaymentLike {
  return { userId: "ana", owedCents: 1000, paidCents: 0, payableCents: 1000, refusal: "", ...figures };
}

describe("owedOnExpense", () => {
  it("reads each ower's share as owed to the one payer", () => {
    expect(owedOnExpense(DINNER, "bob", "ana")).toBe(1000);
    expect(owedOnExpense(DINNER, "chen", "ana")).toBe(1000);
  });

  it("is zero for the payer, and in the other direction", () => {
    expect(owedOnExpense(DINNER, "ana", "bob")).toBe(0);
    expect(owedOnExpense(DINNER, "bob", "chen")).toBe(0);
  });

  it("names the same creditors the ledger does when two people paid", () => {
    // Ana paid 20 and Bob 10 of a 30 bill split three ways: Ana is owed 10,
    // Bob nothing, and Chen's 10 goes to Ana alone.
    const shared = {
      payers: [
        { userId: "ana", amountCents: 2000 },
        { userId: "bob", amountCents: 1000 },
      ],
      splits: DINNER.splits,
    };
    expect(creditorsOnExpense(shared, "chen")).toEqual([{ userId: "ana", owedCents: 1000 }]);
    expect(creditorsOnExpense(shared, "bob")).toEqual([]);
  });

  it("lists one creditor per person when a share is owed to two payers", () => {
    const twoPayers = {
      payers: [
        { userId: "ana", amountCents: 1500 },
        { userId: "bob", amountCents: 1500 },
      ],
      splits: [{ userId: "chen", owedCents: 3000 }],
    };
    expect(creditorsOnExpense(twoPayers, "chen")).toEqual([
      { userId: "ana", owedCents: 1500 },
      { userId: "bob", owedCents: 1500 },
    ]);
  });
});

describe("payableOnExpense", () => {
  it("is what is left of the share", () => {
    expect(payableOnExpense(1000, 400, 5000)).toBe(600);
  });

  it("never exceeds what is owed in the expense's balance", () => {
    // Ana also owes Bob 7 elsewhere in the group, so only 3 is still owed.
    expect(payableOnExpense(1000, 0, 300)).toBe(300);
  });

  it("is zero once paid, or overpaid after an edit made the share smaller", () => {
    expect(payableOnExpense(1000, 1000, 5000)).toBe(0);
    expect(payableOnExpense(800, 1000, 5000)).toBe(0);
  });
});

describe("repaymentState", () => {
  it("is paid once the payments cover the share", () => {
    expect(repaymentState(repayment({ paidCents: 1000, payableCents: 0 }))).toBe("paid");
    expect(repaymentState(repayment({ owedCents: 800, paidCents: 1000, payableCents: 0 }))).toBe("paid");
  });

  it("is due while a payment can be made", () => {
    expect(repaymentState(repayment({}))).toBe("due");
    expect(repaymentState(repayment({ paidCents: 400, payableCents: 600 }))).toBe("due");
  });

  it("tells a square balance from a refused payment", () => {
    expect(repaymentState(repayment({ payableCents: 0 }))).toBe("square");
    expect(repaymentState(repayment({ payableCents: 0, refusal: "This group is archived." }))).toBe("blocked");
  });
});

describe("readRepayment", () => {
  it("offers the whole share on a fresh bill", () => {
    expect(readRepayment(repayment({}), "Ana", true, "USD")).toEqual({
      state: "due",
      title: "You owe Ana",
      amountCents: 1000,
      detail: "Your share of this bill",
      action: "Pay back $10.00",
    });
  });

  it("offers the rest after a part payment, and says how much was paid", () => {
    const view = readRepayment(repayment({ paidCents: 400, payableCents: 600 }), "Ana", true, "USD");
    expect(view.amountCents).toBe(600);
    expect(view.detail).toBe("$4.00 of $10.00 paid back");
    expect(view.action).toBe("Pay the rest $6.00");
  });

  it("gives both figures when the balance holds less than the share", () => {
    const view = readRepayment(repayment({ paidCents: 200, payableCents: 300 }), "Ana", false, "USD");
    expect(view.amountCents).toBe(300);
    expect(view.action).toBe("Pay back $3.00");
    expect(view.detail).toBe("$8.00 left on this bill · $3.00 still owed outside groups");
  });

  it("confirms a paid bill with what was paid", () => {
    const view = readRepayment(repayment({ paidCents: 1000, payableCents: 0 }), "Ana", true, "USD");
    expect(view).toMatchObject({ state: "paid", title: "Paid back", action: "" });
    expect(view.detail).toBe("You paid Ana $10.00 for this bill");
  });

  it("says a square balance plainly, with no button", () => {
    const view = readRepayment(repayment({ payableCents: 0 }), "Ana", true, "USD");
    expect(view).toEqual({
      state: "square",
      title: "Nothing to pay Ana",
      amountCents: 0,
      detail: "Nothing more is payable on this bill right now.",
      action: "",
    });
  });

  it("puts the server's reason where the button would be", () => {
    const view = readRepayment(
      repayment({ paidCents: 200, payableCents: 0, refusal: "This group is archived." }),
      "Ana",
      true,
      "USD",
    );
    expect(view).toMatchObject({ state: "blocked", amountCents: 800, detail: "This group is archived.", action: "" });
  });
});

describe("expensePaymentLine", () => {
  it("speaks from the reader's side", () => {
    const payment = { fromUserId: "bob", amountCents: 1000, methodLabel: "" };
    expect(expensePaymentLine(payment, "bob", "Ana", "USD")).toBe("You paid Ana $10.00");
    expect(expensePaymentLine(payment, "ana", "Bob", "USD")).toBe("Bob paid you $10.00");
  });

  it("names the method the money moved through", () => {
    const payment = { fromUserId: "bob", amountCents: 1000, methodLabel: "bKash" };
    expect(expensePaymentLine(payment, "bob", "Ana", "USD")).toBe("You paid Ana $10.00 via bKash");
  });
});

describe("billPayableCents", () => {
  /**
   * The dialog's reading of a group balance between the reader and Ana.
   *
   * @param netCents - The balance from the reader's side: < 0 means they owe Ana.
   * @returns The reading.
   */
  const reading = (netCents: number) =>
    readSettlePositions(
      [{ currency: "USD", netCents, digest: "", scopes: [{ groupId: "trip", groupName: "Trip", netCents }] }],
      "USD",
      "trip",
    );

  it("offers the bill's amount while the balance holds it", () => {
    expect(billPayableCents(reading(-5000), 1000)).toBe(1000);
  });

  it("offers no more than the balance now holds", () => {
    expect(billPayableCents(reading(-300), 1000)).toBe(300);
  });

  it("offers nothing once the balance is square or points the other way", () => {
    expect(billPayableCents(reading(0), 1000)).toBe(0);
    expect(billPayableCents(reading(700), 1000)).toBe(0);
  });

  it("names the figure when too much is typed", () => {
    expect(billOverLimitMessage(1000, "USD")).toBe("that's more than the $10.00 left to pay for this bill");
  });
});

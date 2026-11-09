/**
 * Paying back one expense: what it leaves one person owing another, and how
 * a bill's page and its pay-back dialog word each state of that — pure. The
 * server reads the same figures when it records a payment for an expense.
 */

import { formatMoney } from "../money/money";
import { expenseDebts } from "./debts";
import type { SettleReading } from "./settlePosition";

/** Bill-specific wording when the amount available for this payment reaches zero. */
export const NOTHING_TO_REPAY = "Nothing more is payable on this bill right now.";

/** The money on an expense these helpers read: who paid what, who owes what. */
export interface ExpenseMoneyLike {
  /** How many cents each person paid toward it. */
  payers: readonly { userId: string; amountCents: number }[];
  /** How many cents each person's share is. */
  splits: readonly { userId: string; owedCents: number }[];
}

/** What the caller owes one person on an expense, as the API's Repayment carries it. */
export interface RepaymentLike {
  /** Who is owed. */
  userId: string;
  /** What the expense alone leaves the caller owing them. */
  owedCents: number;
  /** What the caller has paid them for this expense. */
  paidCents: number;
  /** The most a payment for this expense can be now; 0 when none can be made. */
  payableCents: number;
  /** Why a payment would be refused while some of it is unpaid; "" when nothing stands in the way. */
  refusal: string;
}

/**
 * Where a repayment stands:
 * - `due`: something is left to pay, and a payment can be made now.
 * - `paid`: the payments made for this expense cover the share.
 * - `square`: some of the share is unpaid, but the viewer owes this person
 *   nothing payable here. The balance can be zero or point the other way.
 * - `blocked`: some is unpaid and owed, but a payment would be refused.
 */
export type RepaymentState = "due" | "paid" | "square" | "blocked";

/** One repayment as a bill's page shows it. */
export interface RepaymentView {
  state: RepaymentState;
  /** The row's first line, e.g. "You owe Ana". */
  title: string;
  /** The row's figure: what can be paid (due), what was paid (paid), what is unpaid (blocked); 0 when square. */
  amountCents: number;
  /** The row's second line. */
  detail: string;
  /** The button's label, amount included; "" when there is no button. */
  action: string;
}

/**
 * What one expense alone leaves one person owing another: the pairwise
 * reading of its payers and splits that every balance is built from, so a
 * bill's page and the ledger name the same people and the same cents.
 *
 * @param money - The expense's payers and splits.
 * @param debtorId - Who would owe.
 * @param creditorId - Who would be owed.
 * @returns Cents the debtor owes the creditor on this expense; 0 when none.
 */
export function owedOnExpense(money: ExpenseMoneyLike, debtorId: string, creditorId: string): number {
  return expenseDebts(
    money.payers.map((payer) => ({ userId: payer.userId, amountCents: payer.amountCents })),
    money.splits.map((split) => ({ userId: split.userId, amountCents: split.owedCents })),
  )
    .filter((debt) => debt.from === debtorId && debt.to === creditorId)
    .reduce((total, debt) => total + debt.amountCents, 0);
}

/**
 * Everyone one person owes on an expense, in the order the ledger reads them.
 *
 * @param money - The expense's payers and splits.
 * @param debtorId - Who owes.
 * @returns Each creditor with what the expense leaves the debtor owing them.
 */
export function creditorsOnExpense(
  money: ExpenseMoneyLike,
  debtorId: string,
): { userId: string; owedCents: number }[] {
  const owedByCreditor = new Map<string, number>();
  for (const debt of expenseDebts(
    money.payers.map((payer) => ({ userId: payer.userId, amountCents: payer.amountCents })),
    money.splits.map((split) => ({ userId: split.userId, amountCents: split.owedCents })),
  )) {
    if (debt.from !== debtorId) continue;
    owedByCreditor.set(debt.to, (owedByCreditor.get(debt.to) ?? 0) + debt.amountCents);
  }
  return [...owedByCreditor].map(([userId, owedCents]) => ({ userId, owedCents }));
}

/**
 * The most a payment for an expense can be: what is left of the share, but
 * never more than is owed in the balance the expense lives in, since that
 * balance is all a payment can pay down.
 *
 * @param owedCents - What the expense leaves the payer owing.
 * @param paidCents - What they have already paid for it.
 * @param scopeOwedCents - What they owe the same person in the expense's balance.
 * @returns Cents a payment may be now; 0 when none.
 */
export function payableOnExpense(owedCents: number, paidCents: number, scopeOwedCents: number): number {
  return Math.max(0, Math.min(owedCents - paidCents, scopeOwedCents));
}

/**
 * Where a repayment stands; see {@link RepaymentState}.
 *
 * @param repayment - The repayment.
 * @returns Its state.
 */
export function repaymentState(repayment: RepaymentLike): RepaymentState {
  if (repayment.paidCents >= repayment.owedCents) return "paid";
  if (repayment.payableCents > 0) return "due";
  return repayment.refusal ? "blocked" : "square";
}

/**
 * Words one repayment for a bill's page: each state as a title, a figure, a
 * second line and the button's label. Figures, not explanations: a share
 * that is more than can be paid says both numbers.
 *
 * @param repayment - The repayment.
 * @param firstName - The first name of whoever is owed.
 * @param inGroup - True for a group expense; false for one outside groups.
 * @param currency - The expense's currency.
 * @returns What the row shows.
 */
export function readRepayment(
  repayment: RepaymentLike,
  firstName: string,
  inGroup: boolean,
  currency: string,
): RepaymentView {
  const money = (cents: number) => formatMoney(cents, currency);
  const where = inGroup ? "in this group" : "outside groups";
  const leftCents = Math.max(0, repayment.owedCents - repayment.paidCents);
  const state = repaymentState(repayment);
  switch (state) {
    case "paid":
      return {
        state,
        title: "Paid back",
        amountCents: repayment.paidCents,
        detail: `You paid ${firstName} ${money(repayment.paidCents)} for this bill`,
        action: "",
      };
    case "square":
      return {
        state,
        title: `Nothing to pay ${firstName}`,
        amountCents: 0,
        detail: NOTHING_TO_REPAY,
        action: "",
      };
    case "blocked":
      return {
        state,
        title: `You owe ${firstName}`,
        amountCents: leftCents,
        detail: repayment.refusal,
        action: "",
      };
    case "due":
      return {
        state,
        title: `You owe ${firstName}`,
        amountCents: repayment.payableCents,
        detail:
          repayment.payableCents < leftCents
            ? `${money(leftCents)} left on this bill · ${money(repayment.payableCents)} still owed ${where}`
            : repayment.paidCents > 0
              ? `${money(repayment.paidCents)} of ${money(repayment.owedCents)} paid back`
              : "Your share of this bill",
        action: `${repayment.paidCents > 0 && repayment.payableCents === leftCents ? "Pay the rest" : "Pay back"} ${money(repayment.payableCents)}`,
      };
  }
}

/**
 * One payment for a bill, from the reader's side: "You paid Ana $12.00" or
 * "Ana paid you $12.00", with how it moved when a method was named.
 *
 * @param payment - The payment.
 * @param payment.fromUserId - Who paid.
 * @param payment.amountCents - How much.
 * @param payment.method - Recorded method key.
 * @param payment.methodLabel - The payment method's name, "" for none.
 * @param readerId - Who is reading.
 * @param otherFirstName - The other person's first name.
 * @param currency - The payment's currency.
 * @returns The line.
 */
export function expensePaymentLine(
  payment: { fromUserId: string; amountCents: number; method: string; methodLabel: string },
  readerId: string,
  otherFirstName: string,
  currency: string,
): string {
  const amount = formatMoney(payment.amountCents, currency);
  const line = payment.fromUserId === readerId
    ? `You paid ${otherFirstName} ${amount}`
    : `${otherFirstName} paid you ${amount}`;
  if (payment.methodLabel) return `${line} via ${payment.methodLabel}`;
  if (payment.method === "cash") return `${line} in cash`;
  return payment.method === "other" ? `${line} via Other` : line;
}

/**
 * What the pay-back dialog may take: the bill's payable amount, and never
 * more than its balance holds as the dialog reads it. The bill's figure was
 * read with the page; the balance is read when the dialog opens, so a
 * payment made since in that balance lowers what is offered.
 *
 * @param reading - The dialog's reading of the bill's one balance.
 * @param billPayableCents - The bill's payable amount, from its page.
 * @returns Cents the dialog offers; 0 when the balance no longer has the payer owing.
 */
export function billPayableCents(reading: SettleReading, billPayableCents: number): number {
  return reading.netCents < 0 ? Math.min(billPayableCents, -reading.netCents) : 0;
}

/**
 * The refusal shown when someone types more than a bill has left to pay.
 *
 * @param payableCents - What the dialog offers.
 * @param currency - The bill's currency.
 * @returns The message.
 */
export function billOverLimitMessage(payableCents: number, currency: string): string {
  return `that's more than the ${formatMoney(payableCents, currency)} left to pay for this bill`;
}

/**
 * Checks the amount a payment app would receive against the bill's current allowance.
 * @param amountCents - Amount to send to the external app.
 * @param payableCents - Latest amount payable to this creditor.
 * @param currency - Immutable currency of the bill.
 * @returns A visible refusal or an empty string when the handoff may proceed.
 */
export function billPaymentError(amountCents: number, payableCents: number, currency: string): string {
  if (payableCents <= 0) return NOTHING_TO_REPAY;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return "Enter a valid amount.";
  return amountCents > payableCents ? billOverLimitMessage(payableCents, currency) : "";
}

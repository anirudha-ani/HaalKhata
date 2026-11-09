/**
 * Paying back one expense: what it leaves one person owing another, what of
 * that they have paid, and what a payment for it can be now. The expense's
 * page reads it to offer the payment; the payment reads it again, under its
 * locks, to refuse anything the page would not have offered.
 */

import type { PoolClient } from "pg";
import { GroupStatus } from "@haalkhata/protogen/group/v1/group_pb";
import {
  billOverLimitMessage,
  creditorsOnExpense,
  payableOnExpense,
  type ExpenseMoneyLike,
} from "@haalkhata/shared/expense/repayment";
import { findUsersByIds } from "@/server/auth/repo/users.repo";
import { invalid, notFound } from "@/server/common/errors";
import { REPAYMENT_REFUSALS } from "@/server/expense/expense.constants";
import {
  findExpenseById,
  loadExpenseChildren,
  type ExpenseChildren,
  type ExpenseRow,
} from "@/server/expense/repo/expenses.repo";
import { findRunningLiveSplit } from "@/server/expense/repo/liveSplits.repo";
import { sumPaidForExpenses } from "@/server/expense/repo/settlements.repo";
import { GROUP_STATUS_STORAGE } from "@/server/group/group.constants";
import { findGroupById, memberIdsAmong } from "@/server/group/repo/groups.repo";
import { owingInScope } from "../balance.usecase";

/** What one person owes another on one expense, and what is left to pay. */
export interface ExpenseRepayment {
  /** Who is owed. */
  userId: string;
  /** What the expense alone leaves the debtor owing them. */
  owedCents: number;
  /** What the debtor has paid them for this expense. */
  paidCents: number;
  /** The most a payment for this expense can be now; 0 when none can be made. */
  payableCents: number;
  /** Why a payment would be refused while some of it is unpaid; "" otherwise. */
  refusal: string;
}

/**
 * An expense's payers and splits, in the shape the shared debt reading takes.
 *
 * @param expenseId - The expense.
 * @param children - Its loaded child rows.
 * @returns Who paid what, and whose share is what.
 */
function moneyOf(expenseId: string, children: ExpenseChildren): ExpenseMoneyLike {
  return {
    payers: (children.payers.get(expenseId) ?? []).map((payer) => ({
      userId: payer.user_id,
      amountCents: payer.amount_cents,
    })),
    splits: (children.splits.get(expenseId) ?? []).map((split) => ({
      userId: split.user_id,
      owedCents: split.owed_cents,
    })),
  };
}

/**
 * Reads repayment limits for the bill in a single snapshot, batching work across payees.
 * The write supplies its recipient to check the same limit under the ledger locks.
 * @param expense - Bill at the time of the read.
 * @param children - Its payers and splits.
 * @param viewerId - Person who would pay.
 * @param client - Snapshot or locked transaction.
 * @param recipient - Only this creditor, when validating one payment.
 * @returns Repayment rows in bill order.
 */
export async function expenseRepayments(
  expense: ExpenseRow, children: ExpenseChildren, viewerId: string, client: PoolClient, recipient?: string,
): Promise<ExpenseRepayment[]> {
  if (expense.deleted_at) return [];
  const people = creditorsOnExpense(moneyOf(expense.id, children), viewerId)
    .filter((person) => !recipient || person.userId === recipient);
  if (!people.length) return [];
  const paid = new Map((await sumPaidForExpenses([expense.id], viewerId, client))
    .map((repayment) => [repayment.to_user, repayment.total]));
  const rows = people.map(({ userId, owedCents }) => ({
    userId, owedCents, paidCents: paid.get(userId) ?? 0, payableCents: 0, refusal: "",
  }));
  const unpaid = rows.filter((repayment) => repayment.paidCents < repayment.owedCents);
  if (!unpaid.length) return rows;
  const live = await findRunningLiveSplit(expense.id, client);
  const group = expense.group_id ? await findGroupById(expense.group_id, client) : null;
  if (live || group === undefined) {
    for (const repayment of unpaid) repayment.refusal = live ? REPAYMENT_REFUSALS.liveSplit : REPAYMENT_REFUSALS.deletedGroup;
    return rows;
  }
  const creditors = unpaid.map((repayment) => repayment.userId);
  const positions = await owingInScope(viewerId, creditors, group, expense.currency, client);
  const members = group ? await memberIdsAmong(group.id, [viewerId, ...creditors], client) : undefined;
  const missing = members ? creditors.filter((person) => !members.has(person)) : [];
  const names = new Map((missing.length ? await findUsersByIds(missing, client) : []).map((user) => [user.id, user.name]));
  for (const repayment of unpaid) {
    const owing = positions.get(repayment.userId)!;
    const rerouted = Boolean(group?.simplify_debts && owing.debtorNetCents < 0 && owing.owedCents === 0);
    if (owing.loop) repayment.refusal = REPAYMENT_REFUSALS.loop;
    else if (!owing.owedCents && !rerouted) continue;
    else if (group?.status === GROUP_STATUS_STORAGE[GroupStatus.DELETED]) repayment.refusal = REPAYMENT_REFUSALS.deletedGroup;
    else if (group && group.status !== GROUP_STATUS_STORAGE[GroupStatus.ACTIVE]) repayment.refusal = REPAYMENT_REFUSALS.archived;
    else if (members && !members.has(viewerId)) repayment.refusal = REPAYMENT_REFUSALS.youLeft;
    else if (members && !members.has(repayment.userId)) repayment.refusal = REPAYMENT_REFUSALS.theyLeft(names.get(repayment.userId) ?? "The person you owe");
    else if (rerouted) repayment.refusal = REPAYMENT_REFUSALS.simplified;
    else repayment.payableCents = payableOnExpense(repayment.owedCents, repayment.paidCents, owing.owedCents);
  }
  return rows;
}

/** A payment for an expense, as the write about to store it sees it. */
export interface ExpensePayment {
  /** The expense it pays back. */
  expenseId: string;
  /** Who paid. */
  payerId: string;
  /** Who was paid. */
  creditorId: string;
  /** The one balance the payment names: a group id, or "" for outside groups. */
  scopeId: string;
  /** The payment's currency. */
  currency: string;
  /** How much. */
  amountCents: number;
}

/**
 * Refuses a payment for an expense that its page would not have offered:
 * one recorded in a balance or currency other than the expense's, from
 * somebody who owes the recipient nothing on it, or for more than is left to
 * pay. Runs under the payment's locks, so what it reads cannot change before
 * the payment is stored, and reads what the page read, through the same
 * function.
 *
 * @param payment - The payment.
 * @param client - The payment's locked transaction.
 * @returns The expense, for the announcement.
 * @throws UsecaseError (not_found, invalid_argument) when it would be refused.
 */
export async function assertExpensePayment(payment: ExpensePayment, client: PoolClient): Promise<ExpenseRow> {
  const expense = await findExpenseById(payment.expenseId, client);
  if (!expense) notFound("expense not found");
  if (expense.deleted_at) invalid("this expense was deleted, so there is nothing to pay back");
  if (payment.scopeId !== (expense.group_id ?? "")) {
    invalid("a payment for an expense is recorded in that expense's balance");
  }
  if (payment.currency !== expense.currency) invalid(`this expense is in ${expense.currency}, not ${payment.currency}`);
  const children = await loadExpenseChildren([expense.id], client, false);
  const [repayment] = await expenseRepayments(expense, children, payment.payerId, client, payment.creditorId);
  if (!repayment) invalid("you don't owe this person anything on this expense");
  if (repayment.paidCents >= repayment.owedCents) invalid("you have already paid this expense back");
  if (repayment.refusal) invalid(repayment.refusal);
  if (repayment.payableCents === 0) {
    invalid("you don't owe this person anything where this expense is any more");
  }
  // Worded as the dialog's own check words it, so a stale dialog reads the same.
  if (payment.amountCents > repayment.payableCents) invalid(billOverLimitMessage(repayment.payableCents, expense.currency));
  return expense;
}

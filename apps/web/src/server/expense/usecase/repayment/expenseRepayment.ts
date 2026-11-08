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
  owedOnExpense,
  payableOnExpense,
  type ExpenseMoneyLike,
} from "@haalkhata/shared/expense/repayment";
import { findUserById } from "@/server/auth/repo/users.repo";
import { invalid, notFound } from "@/server/common/errors";
import { REPAYMENT_REFUSALS } from "@/server/expense/expense.constants";
import {
  findExpenseById,
  loadExpenseChildren,
  type ExpenseChildren,
  type ExpenseRow,
} from "@/server/expense/repo/expenses.repo";
import { findRunningLiveSplit } from "@/server/expense/repo/liveSplits.repo";
import { sumExpensePayments } from "@/server/expense/repo/settlements.repo";
import { GROUP_STATUS_STORAGE } from "@/server/group/group.constants";
import { findGroupById, isMember, type GroupRow } from "@/server/group/repo/groups.repo";
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
 * Why a group would refuse a payment between these two that is still owed
 * in it, or "" when nothing stands in the way: the group is deleted,
 * archived, or has lost one of the two.
 *
 * Only asked once the balance says something is owed. Archiving and leaving
 * both need the balance settled first, so asking before would refuse what is
 * simply square ("unarchive it to pay" for a bill nobody owes anything on).
 *
 * @param group - The expense's group, or null for one outside groups.
 * @param debtorId - Who would pay.
 * @param creditorId - Who would be paid.
 * @param client - Snapshot or locked transaction.
 * @returns The refusal, or "".
 */
async function groupRefusal(
  group: GroupRow | null,
  debtorId: string,
  creditorId: string,
  client: PoolClient,
): Promise<string> {
  if (group === null) return "";
  if (group.status === GROUP_STATUS_STORAGE[GroupStatus.DELETED]) return REPAYMENT_REFUSALS.deletedGroup;
  if (group.status !== GROUP_STATUS_STORAGE[GroupStatus.ACTIVE]) return REPAYMENT_REFUSALS.archived;
  if (!(await isMember(group.id, debtorId, client))) return REPAYMENT_REFUSALS.youLeft;
  if (!(await isMember(group.id, creditorId, client))) {
    return REPAYMENT_REFUSALS.theyLeft((await findUserById(creditorId, client))?.name ?? "The person you owe");
  }
  return "";
}

/**
 * What one person owes another on one expense, what they have paid for it,
 * and what a payment for it can be now.
 *
 * The payment can be at most what is left of the share, and at most what
 * the debtor still owes the creditor in the expense's balance, since that is
 * all a payment can pay down. When some of the share is unpaid but that
 * balance is square (paid some other way, or evened out by other expenses)
 * nothing is payable and there is no refusal: there is simply nothing to pay.
 *
 * @param expense - The expense, as read on `client`.
 * @param children - Its child rows, read on `client`.
 * @param debtorId - Who would pay.
 * @param creditorId - Who would be paid.
 * @param client - Snapshot for a page, or the payment's locked transaction.
 * @returns The repayment.
 */
export async function expenseRepayment(
  expense: ExpenseRow,
  children: ExpenseChildren,
  debtorId: string,
  creditorId: string,
  client: PoolClient,
): Promise<ExpenseRepayment> {
  const owedCents = owedOnExpense(moneyOf(expense.id, children), debtorId, creditorId);
  const paidCents = await sumExpensePayments(expense.id, debtorId, creditorId, expense.currency, client);
  const settled = { userId: creditorId, owedCents, paidCents, payableCents: 0, refusal: "" };
  if (expense.deleted_at || owedCents <= paidCents) return settled;
  // While a split runs its amounts can still change, so nothing is paid yet.
  if (await findRunningLiveSplit(expense.id, client)) return { ...settled, refusal: REPAYMENT_REFUSALS.liveSplit };
  const group = expense.group_id ? await findGroupById(expense.group_id, client) : null;
  if (group === undefined) return { ...settled, refusal: REPAYMENT_REFUSALS.deletedGroup };
  const owing = await owingInScope(debtorId, creditorId, group, expense.currency, client);
  if (owing.loop) return { ...settled, refusal: REPAYMENT_REFUSALS.loop };
  // A simplified group can route this debt to somebody else entirely: square
  // with the payer while still owing the group. That is not square, and the
  // way to pay is the group's page.
  const routedElsewhere = owing.owedCents <= 0 && Boolean(group?.simplify_debts) && owing.debtorNetCents < 0;
  if (owing.owedCents <= 0 && !routedElsewhere) return settled;
  const refusal = await groupRefusal(group, debtorId, creditorId, client);
  if (refusal) return { ...settled, refusal };
  if (routedElsewhere) return { ...settled, refusal: REPAYMENT_REFUSALS.simplified };
  return { ...settled, payableCents: payableOnExpense(owedCents, paidCents, owing.owedCents) };
}

/**
 * Everyone the viewer owes on an expense, with what is left to pay each.
 *
 * @param expense - The expense, as read on `client`.
 * @param children - Its child rows, read on `client`.
 * @param viewerId - The caller.
 * @param client - The page's snapshot.
 * @returns One repayment per person owed; empty for a deleted expense.
 */
export async function expenseRepayments(
  expense: ExpenseRow,
  children: ExpenseChildren,
  viewerId: string,
  client: PoolClient,
): Promise<ExpenseRepayment[]> {
  if (expense.deleted_at) return [];
  const repayments: ExpenseRepayment[] = [];
  // One at a time: they share the snapshot's one connection.
  for (const creditor of creditorsOnExpense(moneyOf(expense.id, children), viewerId)) {
    repayments.push(await expenseRepayment(expense, children, viewerId, creditor.userId, client));
  }
  return repayments;
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
  const repayment = await expenseRepayment(expense, children, payment.payerId, payment.creditorId, client);
  if (repayment.owedCents === 0) invalid("you don't owe this person anything on this expense");
  if (repayment.paidCents >= repayment.owedCents) invalid("you have already paid this expense back");
  if (repayment.refusal) invalid(repayment.refusal);
  if (repayment.payableCents === 0) {
    invalid("you don't owe this person anything where this expense is any more");
  }
  // Worded as the dialog's own check words it, so a stale dialog reads the same.
  if (payment.amountCents > repayment.payableCents) invalid(billOverLimitMessage(repayment.payableCents, expense.currency));
  return expense;
}

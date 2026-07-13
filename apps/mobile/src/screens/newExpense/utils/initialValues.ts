/** Pure assembly of the expense form's initial state (create + edit). */

import type { Expense } from "@haalkhata/protogen/expense/v1/expense_pb";
import { centsToInput, todayISO } from "@/lib/money/money";
import type { FormSplitType } from "./splitForm";

/** Initial values for every field of the expense form. */
export interface ExpenseFormInitial {
  /** Selected context: "g:<groupId>", "f:<friendId>", or "" for none. */
  context: string;
  /** Expense description text. */
  description: string;
  /** Raw amount input string (e.g. "12.50"), "" when empty. */
  amount: string;
  /** Expense date as an ISO yyyy-mm-dd string. */
  date: string;
  /** Expense category key (e.g. "general"). */
  category: string;
  /** Free-form notes. */
  notes: string;
  /** Which split mode the form starts in. */
  splitType: FormSplitType;
  /** Participation per user id; null = default (everyone checked). */
  checked: Record<string, boolean> | null;
  /** Raw per-user split value inputs, keyed by user id. */
  splitInputs: Record<string, string>;
  /** Whether the multi-payer editor starts enabled. */
  multiPayer: boolean;
  /** User id preselected in the single-payer select. */
  singlePayerId: string;
  /** Raw per-user paid-amount inputs for multi-payer mode, keyed by user id. */
  payerAmounts: Record<string, string>;
}

/**
 * Builds the expense form's initial state: creation defaults (optionally
 * preselecting a group or friend context) when no expense is given, otherwise
 * the field values of the expense being edited.
 *
 * @param params - Route search params: `initialGroupId` / `initialFriendId`
 *   preselect the context ("" = none).
 * @param currentUserId - Id of the signed-in user (default single payer).
 * @param expense - The expense being edited, or undefined when creating.
 * @returns The fully-resolved initial form values.
 */
export function buildInitialValues(
  params: { initialGroupId: string; initialFriendId: string },
  currentUserId: string,
  expense?: Expense,
): ExpenseFormInitial {
  if (!expense) {
    return {
      context: params.initialGroupId
        ? `g:${params.initialGroupId}`
        : params.initialFriendId
          ? `f:${params.initialFriendId}`
          : "",
      description: "",
      amount: "",
      date: todayISO(),
      category: "general",
      notes: "",
      splitType: "equal",
      checked: null,
      splitInputs: {},
      multiPayer: false,
      singlePayerId: currentUserId,
      payerAmounts: {},
    };
  }

  const multiPayer = expense.payers.length > 1;
  return {
    context: expense.groupId ? `g:${expense.groupId}` : "",
    description: expense.description,
    amount: centsToInput(expense.amountCents),
    date: expense.expenseDate,
    category: expense.category,
    notes: expense.notes,
    splitType:
      expense.splitType === "itemized" ? "equal" : (expense.splitType as FormSplitType),
    checked: Object.fromEntries(expense.splits.map((split) => [split.userId, true])),
    splitInputs:
      expense.splitType === "exact"
        ? Object.fromEntries(
            expense.splits.map((split) => [split.userId, centsToInput(split.owedCents)]),
          )
        : {},
    multiPayer,
    singlePayerId: expense.payers[0]?.userId ?? currentUserId,
    payerAmounts: multiPayer
      ? Object.fromEntries(
          expense.payers.map((payer) => [payer.userId, centsToInput(payer.amountCents)]),
        )
      : {},
  };
}

/** Pure assembly of the expense form's initial state (create + edit). */

import type { Expense } from "@haalkhata/protogen/expense/v1/expense_pb";
import { centsToInput, todayISO } from "@haalkhata/shared/money/money";
import { draftItemsFromLines, type DraftItem } from "@/lib/expense/itemDraft";
import type { FormSplitType } from "./splitForm";

/** Initial values for every field of the expense form. */
export interface ExpenseFormInitial {
  /** Selected group id, or "" for a one-off (non-group) expense. */
  groupId: string;
  /** Ids of the ad-hoc participants besides you; empty when a group is selected. */
  friendIds: string[];
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
  /** Line items for the itemized split; empty unless editing an itemized expense. */
  items: DraftItem[];
  /** Raw tax input for the itemized split. */
  tax: string;
  /** Raw tip input for the itemized split. */
  tip: string;
}

/**
 * Builds the expense form's initial state: creation defaults (optionally
 * preselecting a group or a friend) when no expense is given, otherwise the
 * field values of the expense being edited.
 *
 * @param params - Route search params: `initialGroupId` preselects a group,
 *   `initialFriendId` seeds the one-off cast with that friend ("" = none).
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
      groupId: params.initialGroupId,
      friendIds:
        !params.initialGroupId && params.initialFriendId ? [params.initialFriendId] : [],
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
      items: [],
      tax: "0.00",
      tip: "0.00",
    };
  }

  const multiPayer = expense.payers.length > 1;
  // A one-off expense carries its cast nowhere but in its own rows, so recover
  // it from the splits and payers. Without this the edit form would load with
  // only you on it and quietly re-save the expense as a solo one.
  const participantIds = [
    ...new Set([
      ...expense.splits.map((split) => split.userId),
      ...expense.payers.map((payer) => payer.userId),
    ]),
  ];
  return {
    groupId: expense.groupId,
    friendIds: expense.groupId
      ? []
      : participantIds.filter((userId) => userId !== currentUserId),
    description: expense.description,
    amount: centsToInput(expense.amountCents, expense.currency),
    date: expense.expenseDate,
    category: expense.category,
    notes: expense.notes,
    splitType: expense.splitType as FormSplitType,
    checked: Object.fromEntries(expense.splits.map((split) => [split.userId, true])),
    splitInputs:
      expense.splitType === "exact"
        ? Object.fromEntries(
            expense.splits.map((split) => [split.userId, centsToInput(split.owedCents, expense.currency)]),
          )
        : {},
    multiPayer,
    singlePayerId: expense.payers[0]?.userId ?? currentUserId,
    payerAmounts: multiPayer
      ? Object.fromEntries(
          expense.payers.map((payer) => [payer.userId, centsToInput(payer.amountCents, expense.currency)]),
        )
      : {},
    // An itemized expense reloads its lines with their assignments, so the
    // receipt can be corrected in place instead of deleted and re-scanned.
    items: draftItemsFromLines(expense.items, expense.currency),
    tax: centsToInput(expense.taxCents, expense.currency),
    tip: centsToInput(expense.tipCents, expense.currency),
  };
}

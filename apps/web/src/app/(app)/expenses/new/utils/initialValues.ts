/** Pure assembly of the expense form's initial state (create + edit). */

import type { Expense } from "@haalkhata/protogen/expense/v1/expense_pb";
import { centsToInput, todayISO } from "@haalkhata/shared/money/money";
import type { DraftLineItem, FormSplitType } from "@/lib/expense/splitForm";
import { nextDraftKey } from "@haalkhata/shared/expense/draftKey";

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
  /** Line items for the itemized split mode; empty in every other mode. */
  items: DraftLineItem[];
  /** Raw tax money input for the itemized split mode. */
  taxInput: string;
  /** Raw tip money input for the itemized split mode. */
  tipInput: string;
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
      taxInput: "",
      tipInput: "",
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
    // Rebuilt from the stored receipt so an itemized expense reopens as what
    // it is. `key` is regenerated rather than reusing the server id: it exists
    // only to keep React's list stable while editing, and the two ids serve
    // different lifetimes — a row deleted and re-added should not resurrect an
    // id the server still has.
    //
    // `total` goes back through centsToInput because the editor works in the
    // money strings a person types, not cents.
    items: expense.items.map((item) => ({
      key: nextDraftKey(),
      name: item.name,
      total: centsToInput(item.totalCents, expense.currency),
      quantity: item.quantity,
      assignees: Object.fromEntries(
        item.assignments.map((assignment) => [assignment.userId, assignment.weight]),
      ),
    })),
    // Blank rather than "0.00" when there was none, so the field reads as empty
    // instead of as a deliberate zero.
    taxInput: expense.taxCents > 0 ? centsToInput(expense.taxCents, expense.currency) : "",
    tipInput: expense.tipCents > 0 ? centsToInput(expense.tipCents, expense.currency) : "",
  };
}

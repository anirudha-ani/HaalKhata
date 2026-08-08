/** Which listed expenses have nothing pending for the viewer — pure. */

/** The slice of an expense this decision reads: id, scope, and who is on it. */
export interface ExpenseParticipants {
  /** Expense id, returned when the expense is settled for the viewer. */
  id: string;
  /** Group the expense belongs to; "" for a one-off. */
  groupId: string;
  /** User ids of everyone on the expense (payers and owers alike). */
  participantIds: string[];
}

/**
 * Picks out the expenses with nothing pending for the viewer.
 *
 * Settlements pay down a scope's balance — a group's, or a pair's one-off
 * ledger — never a specific expense, so "this expense is settled" can only
 * honestly mean "the scope it lives in owes nothing that involves you":
 *
 * - A group expense is settled for the viewer when their net in that group
 *   is zero. When the group still owes (either direction), none of its
 *   expenses are singled out, because the ledger holds one net, not a
 *   per-expense earmark.
 * - A one-off expense is settled when the viewer's one-off pair balance with
 *   every other participant on it is zero — "every", because a three-person
 *   one-off is pending as long as any of its pairs is.
 *
 * A scope that nets to zero without any settlement recorded (two expenses
 * that cancel) counts as settled too: the badge answers "is anything still
 * pending from this?", not "was a payment typed in?".
 *
 * @param expenses - The listed expenses, reduced to id/scope/participants.
 * @param viewerId - The caller the settledness is computed for.
 * @param viewerNetByGroupId - The viewer's net per group id, in cents.
 * @param oneOffNetByUserId - The viewer's one-off pair net per counterparty
 *   user id, in cents.
 * @returns Ids of the expenses with nothing pending for the viewer.
 */
export function settledExpenseIds(
  expenses: readonly ExpenseParticipants[],
  viewerId: string,
  viewerNetByGroupId: ReadonlyMap<string, number>,
  oneOffNetByUserId: ReadonlyMap<string, number>,
): string[] {
  return expenses
    .filter((expense) =>
      expense.groupId
        ? (viewerNetByGroupId.get(expense.groupId) ?? 0) === 0
        : expense.participantIds
            .filter((participantId) => participantId !== viewerId)
            .every((participantId) => (oneOffNetByUserId.get(participantId) ?? 0) === 0),
    )
    .map((expense) => expense.id);
}

/** SQL for "is this person on the expense?", shared by every query that asks it. */

/**
 * SQL that is true when the expense aliased `expense` has a payer or a share
 * whose user matches `userMatch`.
 *
 * It names the person's expenses as one set, found through the per-person
 * indexes on payers and shares (`idx_payers_user`, `idx_splits_user`), and
 * keeps the expenses in it. Postgres builds that set once. Asked the other
 * way — `EXISTS (… UNION …)` against each expense — it cannot use those
 * indexes and runs the check once for every expense in the table, so one
 * person's list cost a scan of the whole app: a second on 200,000 expenses,
 * where this takes milliseconds. Each expense is in the set once, however
 * many ways the person is on it, so no DISTINCT is needed either.
 *
 * @param userMatch - The comparison applied to `user_id`, e.g. `= $1` or
 *   `= ANY($2::text[])`; a placeholder, never a value.
 * @returns The condition, for a WHERE over `expenses expense`.
 */
export function expenseInvolvesSql(userMatch: string): string {
  return `expense.id IN (SELECT split.expense_id FROM expense_splits split WHERE split.user_id ${userMatch}
                         UNION SELECT payer.expense_id FROM expense_payers payer WHERE payer.user_id ${userMatch})`;
}

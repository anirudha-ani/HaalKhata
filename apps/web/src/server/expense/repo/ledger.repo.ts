/** Cross-table ledger aggregates the database can compute in one pass. */

import type { PoolClient } from "pg";
import { query, queryOne } from "@/server/common/db/db";
import { exactTimeSql } from "@/server/common/pagination/pagination";
import { expenseInvolvesSql } from "./expenseInvolvement";

/**
 * Checks live movements for a nonzero participant net in any group currency.
 * Aggregation stays in Postgres; at most one row reaches the application.
 *
 * @param groupId - Group whose full ledger is checked, including past members.
 * @param client - Transaction client holding the group's ledger lock.
 * @returns True when any participant has money outstanding in any currency.
 */
export async function hasUnsettledGroupBalances(groupId: string, client: PoolClient): Promise<boolean> {
  return (await queryOne(
    `SELECT 1 AS unsettled FROM (
       SELECT pay.user_id, exp.currency, pay.amount_cents AS delta
         FROM expense_payers pay JOIN expenses exp ON exp.id = pay.expense_id
        WHERE exp.group_id = $1 AND exp.deleted_at IS NULL
       UNION ALL
       SELECT spl.user_id, exp.currency, -spl.owed_cents
         FROM expense_splits spl JOIN expenses exp ON exp.id = spl.expense_id
        WHERE exp.group_id = $1 AND exp.deleted_at IS NULL
       UNION ALL
       SELECT from_user, currency, amount_cents FROM settlements
        WHERE group_id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT to_user, currency, -amount_cents FROM settlements
        WHERE group_id = $1 AND deleted_at IS NULL
     ) movement
     GROUP BY movement.user_id, movement.currency
     HAVING SUM(movement.delta) <> 0 LIMIT 1`,
    [groupId], client,
  )) !== undefined;
}

/**
 * A user's net position in each of several groups, per currency, in one
 * query.
 *
 * Net = what they paid − what they owe + payments they made − payments they
 * received, over live rows only. Nets do not depend on how a group routes
 * its debts (pairwise or simplified route the same nets), so this is the
 * same number a walk of the group's ledger gives — without loading every
 * expense and settlement of every group into the process one group at a
 * time. The group list is the caller most exposed to that: a person in many
 * groups used to cost one full ledger read per group, each on its own pool
 * connection.
 *
 * Per currency because a group can hold a payment recorded in another
 * currency before group payments were kept to the group's own:
 * a dollar owed and a euro paid are two balances, not a settled one.
 *
 * @param userId - User whose positions are computed.
 * @param groupIds - Groups to compute the position in.
 * @param client - Optional transaction client.
 * @returns Group id → currency → net cents (> 0 ⇒ owed money); only
 *   non-zero nets are present, and groups with none are absent.
 */
export async function sumUserNetByGroup(
  userId: string,
  groupIds: readonly string[],
  client?: PoolClient,
): Promise<Map<string, Map<string, number>>> {
  if (groupIds.length === 0) return new Map();
  const rows = await query<{ group_id: string; currency: string; net: number }>(
    `SELECT movement.group_id, movement.currency, SUM(movement.delta)::bigint AS net
       FROM (
         SELECT exp.group_id, exp.currency, pay.amount_cents AS delta
           FROM expense_payers pay JOIN expenses exp ON exp.id = pay.expense_id
          WHERE pay.user_id = $1 AND exp.group_id = ANY($2::text[]) AND exp.deleted_at IS NULL
         UNION ALL
         SELECT exp.group_id, exp.currency, -spl.owed_cents
           FROM expense_splits spl JOIN expenses exp ON exp.id = spl.expense_id
          WHERE spl.user_id = $1 AND exp.group_id = ANY($2::text[]) AND exp.deleted_at IS NULL
         UNION ALL
         SELECT group_id, currency, amount_cents FROM settlements
          WHERE from_user = $1 AND group_id = ANY($2::text[]) AND deleted_at IS NULL
         UNION ALL
         SELECT group_id, currency, -amount_cents FROM settlements
          WHERE to_user = $1 AND group_id = ANY($2::text[]) AND deleted_at IS NULL
       ) movement
      GROUP BY movement.group_id, movement.currency
     HAVING SUM(movement.delta) <> 0`,
    [userId, [...groupIds]],
    client,
  );
  const nets = new Map<string, Map<string, number>>();
  for (const entry of rows) {
    const byCurrency = nets.get(entry.group_id) ?? new Map<string, number>();
    byCurrency.set(entry.currency, entry.net);
    nets.set(entry.group_id, byCurrency);
  }
  return nets;
}

/**
 * How much the live expenses each person is on — as a payer or with a share
 * — add up to in one currency, counting each expense once per person.
 *
 * @param userIds - People to total.
 * @param currency - The currency to total in.
 * @param exceptExpenseId - An expense to leave out (the one being replaced), or null.
 * @param client - Transaction client of the write being checked.
 * @returns Person id → total minor units; people on no such expense are absent.
 */
export async function sumExpenseVolumes(
  userIds: readonly string[],
  currency: string,
  exceptExpenseId: string | null,
  client: PoolClient,
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  // Summed as NUMERIC and read as text: a total is only compared against a
  // ceiling, so it need not fit a BIGINT, let alone a JavaScript number.
  const rows = await query<{ user_id: string; volume: string }>(
    `SELECT involved.user_id, SUM(exp.amount_cents)::numeric::text AS volume
       FROM (
         SELECT pay.user_id, pay.expense_id FROM expense_payers pay WHERE pay.user_id = ANY($1::text[])
         UNION
         SELECT spl.user_id, spl.expense_id FROM expense_splits spl WHERE spl.user_id = ANY($1::text[])
       ) involved
       JOIN expenses exp ON exp.id = involved.expense_id
      WHERE exp.currency = $2 AND exp.deleted_at IS NULL AND exp.id IS DISTINCT FROM $3
      GROUP BY involved.user_id`,
    [[...userIds], currency, exceptExpenseId],
    client,
  );
  return new Map(rows.map((entry) => [entry.user_id, Number(entry.volume)]));
}

/**
 * A fingerprint of everything that decides two people's statement: each
 * expense they share (its currency, date, moment written, whether it is
 * deleted, and every payer and split on it) and each payment between them
 * (who paid, how much, in what, whether it was removed). It changes when any
 * line is added, edited, moved, removed or restored, and only then; text
 * that moves no money, like a description, is left out.
 *
 * A later page of the statement continues the running balance from where the
 * first page left off. It compares this fingerprint with the one the first
 * page was read with, so it never continues from a history that has since
 * changed. Computed in Postgres; one row reaches the application.
 *
 * @param firstUserId - One of the two people.
 * @param secondUserId - The other.
 * @param client - Snapshot client the page is read on.
 * @returns A hex digest.
 */
export async function pairHistoryDigest(
  firstUserId: string,
  secondUserId: string,
  client: PoolClient,
): Promise<string> {
  const digestRow = await queryOne<{ digest: string }>(
    `SELECT md5(coalesce(string_agg(line.part, '|' ORDER BY line.part COLLATE "C"), '')) AS digest
       FROM (
         SELECT concat_ws(':', 'expense', expense.id, expense.currency, expense.expense_date::text,
                  ${exactTimeSql("expense.created_at")}, (expense.deleted_at IS NULL)::text,
                  (SELECT string_agg(payer.user_id || '=' || payer.amount_cents, ','
                                     ORDER BY payer.user_id COLLATE "C", payer.amount_cents)
                     FROM expense_payers payer WHERE payer.expense_id = expense.id),
                  (SELECT string_agg(split.user_id || '=' || split.owed_cents, ','
                                     ORDER BY split.user_id COLLATE "C", split.owed_cents)
                     FROM expense_splits split WHERE split.expense_id = expense.id)) AS part
           FROM expenses expense
          WHERE ${expenseInvolvesSql("= $1")}
            AND ${expenseInvolvesSql("= $2")}
         UNION ALL
         SELECT concat_ws(':', 'payment', settlement.id, settlement.from_user, settlement.currency,
                  settlement.amount_cents::text, (settlement.deleted_at IS NULL)::text)
           FROM settlements settlement
          WHERE (settlement.from_user = $1 AND settlement.to_user = $2)
             OR (settlement.from_user = $2 AND settlement.to_user = $1)
       ) line`,
    [firstUserId, secondUserId],
    client,
  );
  return digestRow?.digest ?? "";
}

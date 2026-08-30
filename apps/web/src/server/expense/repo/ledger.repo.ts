/** Cross-table ledger aggregates the database can compute in one pass. */

import type { PoolClient } from "pg";
import { query } from "@/server/common/db";

/**
 * A user's net position in each of several groups, in one query.
 *
 * Net = what they paid − what they owe + payments they made − payments they
 * received, over live rows only. Nets do not depend on how a group routes
 * its debts (pairwise or simplified route the same nets), so this is the
 * same number `userNetInGroup` derives from the full ledger — without
 * loading every expense and settlement of every group into the process one
 * group at a time. The group list is the caller most exposed to that: a
 * person in many groups used to cost one full ledger read per group, each
 * on its own pool connection.
 *
 * @param userId - User whose positions are computed.
 * @param groupIds - Groups to compute the position in.
 * @param client - Optional transaction client.
 * @returns Group id → net cents (> 0 ⇒ owed money); groups with no rows
 *   involving the user are absent.
 */
export async function sumUserNetByGroup(
  userId: string,
  groupIds: readonly string[],
  client?: PoolClient,
): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const rows = await query<{ group_id: string; net: string }>(
    `SELECT movement.group_id, SUM(movement.delta)::bigint AS net
       FROM (
         SELECT exp.group_id, pay.amount_cents AS delta
           FROM expense_payers pay JOIN expenses exp ON exp.id = pay.expense_id
          WHERE pay.user_id = $1 AND exp.group_id = ANY($2::text[]) AND exp.deleted_at IS NULL
         UNION ALL
         SELECT exp.group_id, -spl.owed_cents
           FROM expense_splits spl JOIN expenses exp ON exp.id = spl.expense_id
          WHERE spl.user_id = $1 AND exp.group_id = ANY($2::text[]) AND exp.deleted_at IS NULL
         UNION ALL
         SELECT group_id, amount_cents FROM settlements
          WHERE from_user = $1 AND group_id = ANY($2::text[]) AND deleted_at IS NULL
         UNION ALL
         SELECT group_id, -amount_cents FROM settlements
          WHERE to_user = $1 AND group_id = ANY($2::text[]) AND deleted_at IS NULL
       ) movement
      GROUP BY movement.group_id`,
    [userId, [...groupIds]],
    client,
  );
  return new Map(rows.map((entry) => [entry.group_id, Number(entry.net)]));
}

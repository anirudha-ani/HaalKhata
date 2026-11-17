/** Cross-table ledger aggregates the database can compute in one pass. */

import type { PoolClient } from "pg";
import { query, queryOne } from "@/server/common/db/db";

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
 * Finds group currencies with any outstanding member net, omitting cancelling loops.
 * @param groupIds - Groups under consideration.
 * @param client - Snapshot or transaction client.
 * @returns Unsettled group and currency pairs.
 */
export async function unsettledPairwiseCurrencies(groupIds: string[], client: PoolClient) {
  if (!groupIds.length) return [];
  return query<{ group_id: string; currency: string }>(
    `SELECT DISTINCT movement.group_id, movement.currency FROM (
       SELECT exp.group_id, pay.user_id, exp.currency, pay.amount_cents AS delta
         FROM expense_payers pay JOIN expenses exp ON exp.id = pay.expense_id
        WHERE exp.group_id = ANY($1::text[]) AND exp.deleted_at IS NULL
       UNION ALL
       SELECT exp.group_id, spl.user_id, exp.currency, -spl.owed_cents
         FROM expense_splits spl JOIN expenses exp ON exp.id = spl.expense_id
        WHERE exp.group_id = ANY($1::text[]) AND exp.deleted_at IS NULL
       UNION ALL
       SELECT group_id, from_user, currency, amount_cents FROM settlements
        WHERE group_id = ANY($1::text[]) AND deleted_at IS NULL
       UNION ALL
       SELECT group_id, to_user, currency, -amount_cents FROM settlements
        WHERE group_id = ANY($1::text[]) AND deleted_at IS NULL
     ) movement
     JOIN groups ON groups.id = movement.group_id
     WHERE NOT groups.simplify_debts
     GROUP BY movement.group_id, movement.user_id, movement.currency
     HAVING SUM(movement.delta) <> 0`, [groupIds], client,
  );
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
 * Every member's net in one group in one currency, in one query: what they
 * paid − what they owe + payments they made − payments they received, over
 * live rows, past members included. The same nets a walk of the group's
 * ledger gives (see {@link sumUserNetByGroup}), so a simplified group's
 * route, worked out from these, is the route its page shows, and a pairwise
 * group whose nets are all zero is a loop that cancels out.
 *
 * @param groupId - The group.
 * @param currency - The currency.
 * @param client - Snapshot or locked transaction.
 * @returns Person id → net cents (> 0 ⇒ owed money); only non-zero nets.
 */
export async function sumGroupNets(
  groupId: string,
  currency: string,
  client: PoolClient,
): Promise<Map<string, number>> {
  const rows = await query<{ user_id: string; net: number }>(
    `SELECT movement.user_id, SUM(movement.delta)::bigint AS net
       FROM (
         SELECT pay.user_id, pay.amount_cents AS delta
           FROM expense_payers pay JOIN expenses exp ON exp.id = pay.expense_id
          WHERE exp.group_id = $1 AND exp.currency = $2 AND exp.deleted_at IS NULL
         UNION ALL
         SELECT spl.user_id, -spl.owed_cents
           FROM expense_splits spl JOIN expenses exp ON exp.id = spl.expense_id
          WHERE exp.group_id = $1 AND exp.currency = $2 AND exp.deleted_at IS NULL
         UNION ALL
         SELECT from_user, amount_cents FROM settlements
          WHERE group_id = $1 AND currency = $2 AND deleted_at IS NULL
         UNION ALL
         SELECT to_user, -amount_cents FROM settlements
          WHERE group_id = $1 AND currency = $2 AND deleted_at IS NULL
       ) movement
      GROUP BY movement.user_id
     HAVING SUM(movement.delta) <> 0`,
    [groupId, currency],
    client,
  );
  return new Map(rows.map((member) => [member.user_id, member.net]));
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
 * Fingerprints compact transactional revisions instead of rescanning history.
 * A revision belongs to one pair in one scope, so unrelated groups never
 * contend for a shared per-person counter. The version prefix invalidates
 * cursors issued before revision tracking was installed.
 * @param firstUserId - One participant.
 * @param secondUserId - The other participant.
 * @param client - The statement's snapshot.
 * @returns A digest that changes after every statement-affecting write.
 */
export async function pairHistoryDigest(firstUserId: string, secondUserId: string, client: PoolClient): Promise<string> {
  const digestRow = await queryOne<{ digest: string }>(
    `SELECT 'v2:' || md5(coalesce(string_agg(scope_key || ':' || revision::text, '|' ORDER BY scope_key COLLATE "C"), '')) AS digest
       FROM ledger_pair_revisions
      WHERE low_user=least($1::text COLLATE "C",$2::text COLLATE "C")
        AND high_user=greatest($1::text COLLATE "C",$2::text COLLATE "C")`,
    [firstUserId,secondUserId],client,
  );
  return digestRow?.digest ?? "";
}

/** SQL over the transactionally maintained, cent-exact expense contributions. */

import type { PoolClient } from "pg";
import { query } from "@/server/common/db/db";
import { exactTimeSql } from "@/server/common/pagination/pagination";
import { LEDGER_LINE_RANK } from "@/server/expense/expense.constants";
import type { LedgerLineKey } from "@/server/expense/domain/ledgerOrder";
import type { ListedExpenseRow } from "./expenses.repo";

/** A normalized scope/pair position, in cents the low id owes the high id. */
export interface MovementTotal {
  group_id: string | null;
  currency: string;
  low_user: string;
  high_user: string;
  cents: number;
}

/**
 * Aggregates a scope's expense contributions and payments in the database.
 * @param groupIds - Group scopes, or null for a pair's direct slate.
 * @param client - Snapshot/transaction client.
 * @param viewerId - Optional person to restrict pairwise reads to.
 * @param otherId - With a direct slate, its other participant.
 * @returns One nonzero number per scope, currency and pair, independent of history length.
 */
export async function sumScopeMovements(groupIds: readonly string[] | null, client?: PoolClient, viewerId?: string, otherId?: string): Promise<MovementTotal[]> {
  if (groupIds?.length === 0) return [];
  return readMovementTotals(groupIds, client, viewerId, otherId ? [otherId] : null);
}

/**
 * Aggregates only the requested counterparties in one balance scope.
 * @param viewerId - Person whose position is being read.
 * @param counterparties - Counterparties on the bill or payment.
 * @param groupId - Group scope, or null for the direct slate.
 * @param client - Snapshot or locked transaction.
 * @returns At most one row per requested pair and currency.
 */
export async function sumScopedPairMovements(viewerId: string, counterparties: readonly string[], groupId: string | null, client?: PoolClient): Promise<MovementTotal[]> {
  if (counterparties.length === 0) return [];
  return readMovementTotals(groupId ? [groupId] : null, client, viewerId, counterparties);
}

/**
 * Aggregates the viewer's pair movements across current and former scopes.
 * @param viewerId - Person whose overall positions are being read.
 * @param client - Consistent balance snapshot.
 * @returns Nonzero pair/currency totals, preserving scope for payable routing.
 */
export async function sumUserMovements(viewerId: string, client: PoolClient): Promise<MovementTotal[]> {
  return readMovementTotals(null, client, viewerId, null, true);
}

/**
 * Shares one indexed SQL aggregate between balance read shapes.
 * @param groupIds - Group scopes or null for a direct slate.
 * @param client - Optional transaction.
 * @param viewerId - Optional participant filter.
 * @param counterparties - Optional counterparty filter.
 * @param allScopes - Include the viewer's group and direct scopes together.
 * @returns One signed number per scope, currency and pair.
 */
async function readMovementTotals(groupIds: readonly string[] | null, client?: PoolClient, viewerId?: string, counterparties: readonly string[] | null = null, allScopes = false): Promise<MovementTotal[]> {
  return query<MovementTotal>(
    `SELECT group_id,currency,low_user,high_user,SUM(cents)::bigint AS cents FROM (
      SELECT group_id,currency,least(from_user COLLATE "C",to_user COLLATE "C") AS low_user,
             greatest(from_user COLLATE "C",to_user COLLATE "C") AS high_user,
             CASE WHEN from_user COLLATE "C" < to_user COLLATE "C" THEN amount_cents ELSE -amount_cents END AS cents
        FROM expense_pair_movements
       WHERE deleted_at IS NULL
         AND ($4::boolean OR ($1::text[] IS NULL AND group_id IS NULL) OR group_id=ANY($1::text[]))
         AND ($2::text IS NULL OR from_user=$2 OR to_user=$2)
         AND ($3::text[] IS NULL OR from_user=ANY($3::text[]) OR to_user=ANY($3::text[]))
      UNION ALL
      SELECT group_id,currency,least(from_user COLLATE "C",to_user COLLATE "C"),
             greatest(from_user COLLATE "C",to_user COLLATE "C"),
             CASE WHEN from_user COLLATE "C" < to_user COLLATE "C" THEN -amount_cents ELSE amount_cents END
        FROM settlements
       WHERE deleted_at IS NULL
         AND ($4::boolean OR ($1::text[] IS NULL AND group_id IS NULL) OR group_id=ANY($1::text[]))
         AND ($2::text IS NULL OR from_user=$2 OR to_user=$2)
         AND ($3::text[] IS NULL OR from_user=ANY($3::text[]) OR to_user=ANY($3::text[]))
    ) movements GROUP BY group_id,currency,low_user,high_user HAVING SUM(cents)<>0`,
    [groupIds, viewerId ?? null, counterparties, allScopes], client,
  );
}

/** A statement's signed live movement by scope, before payable routing. */
export interface PairHistoryTotal {
  group_id: string | null;
  currency: string;
  cents: number;
}

/**
 * Sums statement movements once in SQL for running balances and scope history.
 * @param viewerId - The reader.
 * @param friendId - The other person.
 * @param client - Snapshot client.
 * @returns Nonzero history totals, positive when the friend owes the reader.
 */
export async function sumPairHistory(viewerId: string, friendId: string, client: PoolClient): Promise<PairHistoryTotal[]> {
  return query<PairHistoryTotal>(
    `SELECT group_id,currency,SUM(cents)::bigint AS cents FROM (
      SELECT group_id,currency,CASE WHEN to_user=$1 THEN amount_cents ELSE -amount_cents END AS cents
        FROM expense_pair_movements WHERE deleted_at IS NULL
         AND ((from_user=$1 AND to_user=$2) OR (from_user=$2 AND to_user=$1))
      UNION ALL
      SELECT group_id,currency,CASE WHEN from_user=$1 THEN amount_cents ELSE -amount_cents END
        FROM settlements WHERE deleted_at IS NULL
         AND ((from_user=$1 AND to_user=$2) OR (from_user=$2 AND to_user=$1))
    ) movements GROUP BY group_id,currency HAVING SUM(cents)<>0`,
    [viewerId,friendId],client,
  );
}

/**
 * Reads only expenses with an actual pair movement, including deleted explanations.
 * @param viewerId - The reader.
 * @param friendId - The friend.
 * @param before - The last displayed line, or null for the newest page.
 * @param limit - Bounded page size plus one lookahead row.
 * @param client - Snapshot client.
 * @returns At most limit expense rows, ordered for the shared statement.
 */
export async function listPairMovementPage(viewerId: string, friendId: string, before: LedgerLineKey | null, limit: number, client: PoolClient): Promise<ListedExpenseRow[]> {
  return query<ListedExpenseRow>(
    `SELECT expense.*,${exactTimeSql("expense.created_at")} AS created_at_exact
       FROM (
         SELECT expense_id,expense_date,created_at FROM expense_pair_movements
          WHERE ((from_user=$1 AND to_user=$2) OR (from_user=$2 AND to_user=$1))
            AND ($3::text IS NULL OR (expense_date COLLATE "C",created_at,$7::int,expense_id COLLATE "C")
                < ($3::text COLLATE "C",$4::timestamptz,$5::int,$6::text COLLATE "C"))
          ORDER BY expense_date COLLATE "C" DESC,created_at DESC,expense_id COLLATE "C" DESC LIMIT $8
       ) movement JOIN expenses expense ON expense.id=movement.expense_id
      ORDER BY movement.expense_date COLLATE "C" DESC,movement.created_at DESC,movement.expense_id COLLATE "C" DESC`,
    [viewerId,friendId,before?.day ?? null,before?.at ?? null,before?.rank ?? null,before?.id ?? null,LEDGER_LINE_RANK.expense,limit],client,
  );
}

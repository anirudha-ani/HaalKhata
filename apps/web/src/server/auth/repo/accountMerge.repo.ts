/**
 * All SQL for absorbing one users row into another, plus the read that
 * previews it.
 *
 * Deliberate layering exception (AGENTS.md): a merge spans users, expenses,
 * groups and social tables in ONE transaction, and splitting its statements
 * across four domain repos to satisfy the per-domain rule would make a
 * one-way, money-touching operation harder to read and easier to get wrong.
 * It lives here whole, and nothing else reaches across domains this way.
 *
 * A user id lives in SIXTEEN places. Fourteen are foreign keys; the last two
 * are not, and are invisible to any `REFERENCES users(id)` search:
 * `activity.audience` (a JSONB array) and `activity.credit_user_id` (untyped
 * TEXT, deliberately unconstrained so the feed survives a deleted user).
 */

import { query, queryOne, transaction } from "@/server/common/db";
import type { PoolClient } from "pg";

/** What a caller would take on by absorbing a row, read before anything changes. */
export interface MergePreviewRow {
  /** Display name the absorbed row carries. */
  name: string;
  /** Undeleted expenses the absorbed row participates in. */
  expense_count: number;
  /** Decimal bigint text for its net cents; positive means it is owed. */
  net_cents: string;
  /** Names of people it shares expenses with. */
  counterparty_names: string[];
}

/** Counts of the destructive corrections a merge had to make. */
export interface MergeOutcome {
  /** Settlements between the two rows, deleted because they were never real money. */
  selfSettlementsRemoved: number;
  /** Expenses where both rows appeared and their shares were summed into one. */
  duplicateSplitsSummed: number;
}

/**
 * Net position in cents for one user, from raw rows.
 *
 * Used only as a before/after invariant inside the merge, so it deliberately
 * does NOT filter `deleted_at` and does not have to agree with the product's
 * balance definition in `expense/domain/balances.ts`. What matters is that the
 * same arithmetic is applied on both sides of the merge: including soft-deleted
 * expenses means a split that failed to repoint shows up as a mismatch instead
 * of hiding behind the filter.
 */
const NET_CENTS_SQL = `
  COALESCE((SELECT SUM(amount_cents) FROM expense_payers WHERE user_id = $1), 0)
  - COALESCE((SELECT SUM(owed_cents) FROM expense_splits WHERE user_id = $1), 0)
  + COALESCE((SELECT SUM(amount_cents) FROM settlements WHERE from_user = $1), 0)
  - COALESCE((SELECT SUM(amount_cents) FROM settlements WHERE to_user = $1), 0)
`;

/**
 * Reads the net position of a user within an open transaction.
 *
 * @param client - The transaction's client; must be the same one the merge uses.
 * @param userId - User whose net to compute.
 * @returns Net cents under {@link NET_CENTS_SQL}.
 */
async function netCents(client: PoolClient, userId: string): Promise<number> {
  const { rows } = await client.query<{ net: string }>(
    `SELECT (${NET_CENTS_SQL}) AS net`,
    [userId],
  );
  return Number(rows[0]?.net ?? 0);
}

/**
 * Summarizes what absorbing a row would bring with it.
 *
 * @param userId - The row that would be absorbed.
 * @returns Its name, expense count, net position and counterparty names.
 */
export async function previewMerge(userId: string): Promise<MergePreviewRow | undefined> {
  return queryOne<MergePreviewRow>(
    `SELECT
       usr.name,
       (SELECT COUNT(DISTINCT exp.id)::int
          FROM expenses exp
          LEFT JOIN expense_splits spl ON spl.expense_id = exp.id
          LEFT JOIN expense_payers pay ON pay.expense_id = exp.id
         WHERE exp.deleted_at IS NULL
           AND (spl.user_id = $1 OR pay.user_id = $1)) AS expense_count,
       (${NET_CENTS_SQL})::bigint AS net_cents,
       COALESCE((
         SELECT json_agg(DISTINCT other.name)
           FROM expense_splits mine
           JOIN expense_splits theirs ON theirs.expense_id = mine.expense_id
           JOIN expenses exp ON exp.id = mine.expense_id
           JOIN users other ON other.id = theirs.user_id
          WHERE mine.user_id = $1 AND theirs.user_id <> $1 AND exp.deleted_at IS NULL
       ), '[]'::json) AS counterparty_names
     FROM users usr
     WHERE usr.id = $1`,
    [userId],
  );
}

/**
 * Collapses a table where both rows may hold a row for the same parent, by
 * summing the loser's amount into the keeper's and then repointing the rest.
 *
 * The three-statement shape matters: summing first, deleting the loser's now
 * redundant rows second, and repointing last is the only order that never
 * violates the composite primary key.
 *
 * @param client - Transaction client.
 * @param table - Table to collapse.
 * @param parentColumn - The other half of the composite key (expense_id / item_id).
 * @param amountColumn - Numeric column to add together on collision.
 * @param keeperId - Row that survives.
 * @param loserId - Row being absorbed.
 * @returns How many collisions were summed.
 */
async function collapseSummed(
  client: PoolClient,
  table: string,
  parentColumn: string,
  amountColumn: string,
  keeperId: string,
  loserId: string,
): Promise<number> {
  const summed = await client.query(
    `UPDATE ${table} keeper
        SET ${amountColumn} = keeper.${amountColumn} + loser.${amountColumn}
       FROM ${table} loser
      WHERE keeper.user_id = $1 AND loser.user_id = $2
        AND keeper.${parentColumn} = loser.${parentColumn}`,
    [keeperId, loserId],
  );
  await client.query(
    `DELETE FROM ${table}
      WHERE user_id = $2
        AND ${parentColumn} IN (SELECT ${parentColumn} FROM ${table} WHERE user_id = $1)`,
    [keeperId, loserId],
  );
  await client.query(`UPDATE ${table} SET user_id = $1 WHERE user_id = $2`, [keeperId, loserId]);
  return summed.rowCount ?? 0;
}

/**
 * Absorbs `loserId` into `keeperId`: every reference to the loser becomes a
 * reference to the keeper, the loser's phone moves across, and the loser is
 * left as a tombstone pointing at the keeper.
 *
 * Runs entirely inside one transaction — a partial merge would leave money
 * split across two rows with no way to tell which half moved.
 *
 * @param keeperId - The caller's account, which survives.
 * @param loserId - The unclaimed row being absorbed.
 * @param phone - E.164 number to move onto the keeper.
 * @returns Counts of the corrections that were applied.
 * @throws Error when the post-merge net does not equal the sum of the two
 *   pre-merge nets, which rolls the whole thing back.
 */
export async function mergeAccounts(
  keeperId: string,
  loserId: string,
  phone: string,
): Promise<MergeOutcome> {
  return transaction(async (client) => {
    // Lock both rows in a fixed order so two concurrent merges cannot
    // interleave into a deadlock or a lost update.
    await client.query(`SELECT id FROM users WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`, [
      [keeperId, loserId].sort(),
    ]);

    const keeperNetBefore = await netCents(client, keeperId);
    const loserNetBefore = await netCents(client, loserId);

    // --- amount tables: sum on collision -----------------------------------
    const duplicateSplitsSummed = await collapseSummed(
      client, "expense_splits", "expense_id", "owed_cents", keeperId, loserId,
    );
    await collapseSummed(
      client, "expense_payers", "expense_id", "amount_cents", keeperId, loserId,
    );
    await collapseSummed(
      client, "expense_item_assignments", "item_id", "weight", keeperId, loserId,
    );

    // --- group membership --------------------------------------------------
    // Carry the stronger role across before dropping the duplicate, or someone
    // who was an admin as the invited row silently loses it.
    await client.query(
      `UPDATE group_members keeper SET role = 'admin'
         FROM group_members loser
        WHERE keeper.user_id = $1 AND loser.user_id = $2
          AND keeper.group_id = loser.group_id
          AND loser.role = 'admin' AND keeper.role <> 'admin'`,
      [keeperId, loserId],
    );
    await client.query(
      `DELETE FROM group_members
        WHERE user_id = $2
          AND group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)`,
      [keeperId, loserId],
    );
    await client.query(`UPDATE group_members SET user_id = $1 WHERE user_id = $2`, [
      keeperId,
      loserId,
    ]);

    // --- friendships: two directions, and a CHECK that rejects self-loops ---
    // chk_friendship_self makes a (K, K) row an error rather than a silent
    // oddity, so every row that would become one is deleted BEFORE repointing.
    await client.query(
      `DELETE FROM friendships
        WHERE user_id = $2 AND friend_id IN (SELECT friend_id FROM friendships WHERE user_id = $1)`,
      [keeperId, loserId],
    );
    await client.query(
      `DELETE FROM friendships
        WHERE friend_id = $2 AND user_id IN (SELECT user_id FROM friendships WHERE friend_id = $1)`,
      [keeperId, loserId],
    );
    await client.query(
      `DELETE FROM friendships
        WHERE (user_id = $2 AND friend_id = $1) OR (user_id = $1 AND friend_id = $2)`,
      [keeperId, loserId],
    );
    await client.query(`UPDATE friendships SET user_id = $1 WHERE user_id = $2`, [keeperId, loserId]);
    await client.query(`UPDATE friendships SET friend_id = $1 WHERE friend_id = $2`, [
      keeperId,
      loserId,
    ]);

    // --- payment handles: the keeper's own choices win ----------------------
    await client.query(
      `DELETE FROM payment_handles
        WHERE user_id = $2 AND method IN (SELECT method FROM payment_handles WHERE user_id = $1)`,
      [keeperId, loserId],
    );
    await client.query(`UPDATE payment_handles SET user_id = $1 WHERE user_id = $2`, [
      keeperId,
      loserId,
    ]);

    // --- straight repoints, no collision possible ---------------------------
    for (const [table, column] of [
      ["groups", "created_by"],
      ["expenses", "created_by"],
      ["comments", "user_id"],
      ["activity", "actor_id"],
      ["activity", "credit_user_id"],
      ["notifications", "user_id"],
    ] as const) {
      await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`, [
        keeperId,
        loserId,
      ]);
    }

    // --- settlements: repoint, then drop money paid to oneself --------------
    await client.query(`UPDATE settlements SET from_user = $1 WHERE from_user = $2`, [
      keeperId,
      loserId,
    ]);
    await client.query(`UPDATE settlements SET to_user = $1 WHERE to_user = $2`, [
      keeperId,
      loserId,
    ]);
    // Scoped to the keeper rather than `from_user = to_user`, so a pre-existing
    // oddity elsewhere in the table is not swept up by this merge.
    const selfSettlements = await client.query(
      `DELETE FROM settlements WHERE from_user = $1 AND to_user = $1`,
      [keeperId],
    );

    // --- activity.audience: a JSONB array, not a foreign key ----------------
    // Missing this leaves dangling ids inside the arrays and silently breaks
    // the merged user's feed, since the feed query is an @> containment test.
    await client.query(
      `UPDATE activity act
          SET audience = (
            SELECT COALESCE(jsonb_agg(DISTINCT mapped.element), '[]'::jsonb)
              FROM (
                SELECT CASE WHEN element = to_jsonb($2::text) THEN to_jsonb($1::text) ELSE element END
                         AS element
                  FROM jsonb_array_elements(act.audience) AS element
              ) mapped
          )
        WHERE act.audience @> to_jsonb($2::text)`,
      [keeperId, loserId],
    );

    // --- identity: the phone moves, the loser becomes a tombstone -----------
    // Surrendering the phone and becoming a tombstone MUST be one statement.
    // An invited row typically has no email, so clearing its phone first would
    // momentarily leave it with no identifier at all and trip
    // chk_users_has_identifier — the constraint is per-row and evaluated at
    // statement end, so setting merged_into in the same UPDATE satisfies it.
    // The phone must also leave this row before it can land on the keeper's,
    // because users.phone carries a partial unique index.
    await client.query(
      `UPDATE users
          SET phone = NULL, merged_into = $1, google_sub = NULL,
              token_version = token_version + 1
        WHERE id = $2`,
      [keeperId, loserId],
    );
    await client.query(`UPDATE users SET phone = $2 WHERE id = $1`, [keeperId, phone]);

    // --- invariant ----------------------------------------------------------
    // Settlements between the two rows net to zero across the pair, so removing
    // them must not move the combined total. Anything else means a reference
    // was missed or an amount double-counted, and the rollback is the point.
    const keeperNetAfter = await netCents(client, keeperId);
    const expected = keeperNetBefore + loserNetBefore;
    if (keeperNetAfter !== expected) {
      throw new Error(
        `account merge would change the balance: expected ${expected} cents, got ${keeperNetAfter}`,
      );
    }

    return {
      selfSettlementsRemoved: selfSettlements.rowCount ?? 0,
      duplicateSplitsSummed,
    };
  });
}

/**
 * Lists the ids of rows absorbed into a user, newest first.
 *
 * @param keeperId - The surviving account.
 * @returns Tombstone ids pointing at it.
 */
export async function findMergedInto(keeperId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE merged_into = $1 ORDER BY id`,
    [keeperId],
  );
  return rows.map((tombstone) => tombstone.id);
}

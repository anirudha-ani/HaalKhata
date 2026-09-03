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
 * User ids occur throughout the schema. Most are foreign keys; two activity
 * fields are not and are therefore invisible to a `REFERENCES users(id)`
 * search: `activity.audience` (a JSONB array) and `activity.credit_user_id`
 * (untyped TEXT, deliberately unconstrained so the feed survives a deleted
 * user). Keep the allowlists below synchronized with new user references.
 */

import { queryOne, transaction } from "@/server/common/db";
import { lockFriendRequestInboxes } from "@/server/common/ledgerLocks";
import type { PoolClient } from "pg";

/** What a caller would take on by absorbing a row, read before anything changes. */
export interface MergePreviewRow {
  /** Display name the absorbed row carries. */
  name: string;
  /** Undeleted expenses the absorbed row participates in. */
  expense_count: number;
  /** Its net cents per currency; positive means it is owed. Zero buckets are absent. */
  nets: Record<string, number>;
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
 * Net position per currency for one user, from raw rows, as a JSON object
 * of currency → cents with zero buckets left out.
 *
 * Used only as a before/after invariant inside the merge, so it deliberately
 * does NOT filter `deleted_at` and does not have to agree with the product's
 * balance definition in `expense/domain/balances.ts`. What matters is that the
 * same arithmetic is applied on both sides of the merge: including soft-deleted
 * expenses means a split that failed to repoint shows up as a mismatch instead
 * of hiding behind the filter. Per currency for the same reason the product
 * is: a dollar and a euro cannot cancel, so they must not be summed here
 * either.
 */
const NET_CENTS_SQL = `
  COALESCE((
    SELECT json_object_agg(currency, net)
      FROM (
        SELECT currency, SUM(delta)::bigint AS net
          FROM (
            SELECT exp.currency, pay.amount_cents AS delta
              FROM expense_payers pay JOIN expenses exp ON exp.id = pay.expense_id
             WHERE pay.user_id = $1
            UNION ALL
            SELECT exp.currency, -spl.owed_cents
              FROM expense_splits spl JOIN expenses exp ON exp.id = spl.expense_id
             WHERE spl.user_id = $1
            UNION ALL
            SELECT currency, amount_cents FROM settlements WHERE from_user = $1
            UNION ALL
            SELECT currency, -amount_cents FROM settlements WHERE to_user = $1
          ) movements
         GROUP BY currency
        HAVING SUM(delta) <> 0
      ) nets
  ), '{}'::json)
`;

/** Exact table/parent/amount combinations that can be collapsed during a merge. */
type SummedMergeTarget =
  | readonly ["expense_splits", "expense_id", "owed_cents"]
  | readonly ["expense_payers", "expense_id", "amount_cents"]
  | readonly ["expense_item_assignments", "item_id", "weight"];

/** Exact table/column pairs eligible for a collision-free direct repoint. */
type DirectMergeTarget =
  | readonly ["groups", "created_by"]
  | readonly ["expenses", "created_by"]
  | readonly ["comments", "user_id"]
  | readonly ["activity", "actor_id"]
  | readonly ["activity", "credit_user_id"]
  | readonly ["notifications", "user_id"]
  | readonly ["operations", "user_id"]
  | readonly ["settlements", "recorded_by"]
  | readonly ["settlements", "deleted_by"]
  | readonly ["expenses", "deleted_by"];

/** Allowlisted direct repoints; these identifiers are interpolated into SQL. */
const DIRECT_MERGE_TARGETS = [
  ["groups", "created_by"],
  ["expenses", "created_by"],
  ["comments", "user_id"],
  ["activity", "actor_id"],
  ["activity", "credit_user_id"],
  ["notifications", "user_id"],
  // Idempotency history belongs to the surviving identity too. An invited
  // row cannot normally create an operation, but repointing keeps this merge
  // complete even if internal tooling or a future flow creates one.
  ["operations", "user_id"],
  // Provenance columns point at people too: who typed a payment in, who
  // removed a payment or an expense.
  ["settlements", "recorded_by"],
  ["settlements", "deleted_by"],
  ["expenses", "deleted_by"],
] as const satisfies readonly DirectMergeTarget[];

/**
 * Reads the net position of a user within an open transaction.
 *
 * @param client - The transaction's client; must be the same one the merge uses.
 * @param userId - User whose net to compute.
 * @returns Net cents per currency under {@link NET_CENTS_SQL}.
 */
async function netCents(client: PoolClient, userId: string): Promise<Record<string, number>> {
  const { rows } = await client.query<{ net: Record<string, number> | null }>(
    `SELECT (${NET_CENTS_SQL}) AS net`,
    [userId],
  );
  return rows[0]?.net ?? {};
}

/**
 * Adds two per-currency positions.
 *
 * @param first - Cents per currency.
 * @param second - Cents per currency.
 * @returns Their sum per currency, zero buckets removed.
 */
function addNets(
  first: Record<string, number>,
  second: Record<string, number>,
): Record<string, number> {
  const combined: Record<string, number> = {};
  for (const [currency, cents] of [...Object.entries(first), ...Object.entries(second)]) {
    const total = (combined[currency] ?? 0) + Number(cents);
    if (total === 0) delete combined[currency];
    else combined[currency] = total;
  }
  return combined;
}

/**
 * Whether two per-currency positions are identical.
 *
 * @param first - Cents per currency.
 * @param second - Cents per currency.
 * @returns True when every bucket matches.
 */
function sameNets(first: Record<string, number>, second: Record<string, number>): boolean {
  const currencies = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...currencies].every(
    (currency) => Number(first[currency] ?? 0) === Number(second[currency] ?? 0),
  );
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
       (${NET_CENTS_SQL}) AS nets,
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
 * @param target - Allowlisted table, parent key, and amount-column tuple.
 * @param keeperId - Row that survives.
 * @param loserId - Row being absorbed.
 * @returns How many collisions were summed.
 */
async function collapseSummed(
  client: PoolClient,
  target: SummedMergeTarget,
  keeperId: string,
  loserId: string,
): Promise<number> {
  const [table, parentColumn, amountColumn] = target;
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
 * @param phone - The loser's E.164 number, or null for an email-only invite
 *   claimed through a link; passed explicitly because it is part of the
 *   eligibility check, not merely copied.
 * @param options - adoptPhone: whether the keeper takes the number as their
 *   own. True only when possession was just proven (the SMS-merge path);
 *   a link claim passes false and the number is simply freed.
 * @returns Counts of the corrections that were applied.
 * @throws Error when the target changed after preview or when the post-merge
 *   net does not equal the sum of the two pre-merge nets; either rolls back.
 */
export async function mergeAccounts(
  keeperId: string,
  loserId: string,
  phone: string | null,
  options: { adoptPhone: boolean },
): Promise<MergeOutcome> {
  return transaction(async (client) => {
    // Friend-request writers take inbox locks before their INSERT acquires
    // foreign-key locks on users. Merge must use that same lock order to
    // avoid deadlocking with a concurrent send or accept; the shared helper
    // sorts, which also keeps two concurrent merges from waiting on each
    // other's second inbox.
    await lockFriendRequestInboxes(client, [keeperId, loserId]);
    // Lock both user rows in a fixed order after the inboxes. This prevents a
    // claim, phone change, or competing merge from interleaving with repoints.
    await client.query(`SELECT id FROM users WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`, [
      [keeperId, loserId].sort(),
    ]);

    // The usecase checked this before entering the transaction, but a rightful
    // owner can claim the invited row in that gap. Re-read only after FOR
    // UPDATE so no claim, phone change, or competing merge can commit between
    // this assertion and the irreversible repoints below.
    // IS NOT DISTINCT FROM: a link claim passes the invite's phone, which for
    // an email-only invitation is NULL, and `phone = NULL` matches nothing.
    const eligibleTarget = await client.query<{ id: string }>(
      `SELECT id FROM users
        WHERE id = $1
          AND password_hash IS NULL
          AND google_sub IS NULL
          AND merged_into IS NULL
          AND phone IS NOT DISTINCT FROM $2`,
      [loserId, phone],
    );
    if (eligibleTarget.rows.length !== 1) {
      throw new Error("account merge target changed while acquiring locks");
    }

    const keeperNetBefore = await netCents(client, keeperId);
    const loserNetBefore = await netCents(client, loserId);

    // --- amount tables: sum on collision -----------------------------------
    const duplicateSplitsSummed = await collapseSummed(
      client,
      ["expense_splits", "expense_id", "owed_cents"],
      keeperId,
      loserId,
    );
    await collapseSummed(
      client,
      ["expense_payers", "expense_id", "amount_cents"],
      keeperId,
      loserId,
    );
    await collapseSummed(
      client,
      ["expense_item_assignments", "item_id", "weight"],
      keeperId,
      loserId,
    );

    // --- group membership --------------------------------------------------
    // Carry the stronger role across before dropping the duplicate, or a group
    // creator represented by the invited row silently loses ownership.
    await client.query(
      `UPDATE group_members keeper SET role = 'owner'
         FROM group_members loser
        WHERE keeper.user_id = $1 AND loser.user_id = $2
          AND keeper.group_id = loser.group_id
          AND loser.role = 'owner' AND keeper.role <> 'owner'`,
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

    // --- pending friend requests -------------------------------------------
    // Requests between the identities become self-requests after the merge
    // and must disappear before the distinct-user check can reject a repoint.
    await client.query(
      `DELETE FROM friend_requests
        WHERE (requester_id = $1 AND recipient_id = $2)
           OR (requester_id = $2 AND recipient_id = $1)`,
      [keeperId, loserId],
    );
    // Collapse same-direction duplicates before moving each side of the
    // directed request. The keeper's existing request wins.
    await client.query(
      `DELETE FROM friend_requests loser
        USING friend_requests keeper
        WHERE loser.requester_id = $2
          AND keeper.requester_id = $1
          AND loser.recipient_id = keeper.recipient_id`,
      [keeperId, loserId],
    );
    await client.query(
      `UPDATE friend_requests SET requester_id = $1 WHERE requester_id = $2`,
      [keeperId, loserId],
    );
    await client.query(
      `DELETE FROM friend_requests loser
        USING friend_requests keeper
        WHERE loser.recipient_id = $2
          AND keeper.recipient_id = $1
          AND loser.requester_id = keeper.requester_id`,
      [keeperId, loserId],
    );
    await client.query(
      `UPDATE friend_requests SET recipient_id = $1 WHERE recipient_id = $2`,
      [keeperId, loserId],
    );

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
    for (const [table, column] of DIRECT_MERGE_TARGETS) {
      await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`, [
        keeperId,
        loserId,
      ]);
    }

    // --- settlements: remove cross-row payments, then repoint ----------------
    // Once the identities merge, payments between them become self-payments.
    // Delete them first so chk_settlements_distinct_users remains true after
    // every individual UPDATE statement, not only by transaction end.
    const selfSettlements = await client.query(
      `DELETE FROM settlements
        WHERE (from_user = $1 AND to_user = $2)
           OR (from_user = $2 AND to_user = $1)`,
      [keeperId, loserId],
    );
    await client.query(`UPDATE settlements SET from_user = $1 WHERE from_user = $2`, [
      keeperId,
      loserId,
    ]);
    await client.query(`UPDATE settlements SET to_user = $1 WHERE to_user = $2`, [
      keeperId,
      loserId,
    ]);
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

    // --- identity: identifiers move, the loser becomes a tombstone ----------
    // Surrendering the identifiers and becoming a tombstone MUST be one
    // statement: clearing them first would momentarily leave the row with no
    // identifier at all and trip chk_users_has_identifier — the constraint is
    // per-row and evaluated at statement end, so setting merged_into in the
    // same UPDATE satisfies it. Both identifiers must also leave this row
    // before they can land on the keeper's, because users.phone and
    // lower(users.email) carry unique indexes that are NOT scoped to live
    // rows — a tombstone that kept an address would strand it forever.
    await client.query(
      `UPDATE users
          SET phone = NULL, email = NULL, merged_into = $1, google_sub = NULL,
              token_version = token_version + 1
        WHERE id = $2`,
      [keeperId, loserId],
    );
    // Adoption is earned, never inherited (§33b). The SMS-merge path adopts
    // the phone because possession was proven seconds earlier; a link claim
    // adopts NOTHING — the invite's identifiers were the inviter's claim,
    // verified by nobody, and promoting a typed number to "the acceptor's
    // phone" squats it against its real owner. The freed email is likewise
    // never copied: its owner reclaims it through Google's verified sign-in.
    if (options.adoptPhone && phone !== null) {
      await client.query(`UPDATE users SET phone = COALESCE(phone, $2) WHERE id = $1`, [
        keeperId,
        phone,
      ]);
    }

    // --- invariant ----------------------------------------------------------
    // Settlements between the two rows net to zero across the pair, so removing
    // them must not move the combined total. Anything else means a reference
    // was missed or an amount double-counted, and the rollback is the point.
    const keeperNetAfter = await netCents(client, keeperId);
    const expected = addNets(keeperNetBefore, loserNetBefore);
    if (!sameNets(keeperNetAfter, expected)) {
      throw new Error(
        `account merge would change the balance: expected ${JSON.stringify(expected)}, got ${JSON.stringify(keeperNetAfter)}`,
      );
    }

    return {
      selfSettlementsRemoved: selfSettlements.rowCount ?? 0,
      duplicateSplitsSummed,
    };
  });
}

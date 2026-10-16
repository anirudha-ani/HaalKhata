/**
 * All SQL for contact discovery: matching identifiers from a caller's address
 * book against accounts that chose to be findable, and the daily count of
 * identifiers each account has checked.
 *
 * Nothing here writes an identifier. The phones and emails a lookup carries
 * exist only as query parameters; the quota table stores a number.
 */

import type { PoolClient } from "pg";
import { query, queryOne } from "@/server/common/db/db";
import type { UserRow } from "@/server/auth/repo/users.repo";

/**
 * One findable account that matched at least one submitted identifier, with
 * how it relates to the caller. Column names mirror the SQL.
 */
export interface DiscoverableAccountRow extends UserRow {
  /** The submitted phone this account holds (verified), or null. */
  matched_phone: string | null;
  /** The submitted email this account holds, lower-cased, or null. */
  matched_email: string | null;
  /** Whether the caller and this account are already friends. */
  is_friend: boolean;
  /** Whether the caller has a request pending with this account. */
  request_sent: boolean;
  /** Whether this account has a request pending with the caller. */
  request_received: boolean;
}

/**
 * Finds the accounts that hold any of the given identifiers and agreed to be
 * found by them. A phone matches only once its holder proved possession of
 * it, because an unverified number may belong to someone else and the
 * caller's contact name would end up beside a stranger. Merged, deleted and
 * suspended rows, the caller, and anyone in a block with the caller in
 * either direction never match.
 *
 * @param callerId - Account doing the lookup.
 * @param phones - E.164 numbers, already normalised and deduplicated.
 * @param emails - Lower-cased emails, already deduplicated.
 * @param client - The lookup's transaction client, so the quota claim and the
 *   match run on one connection.
 * @returns One row per matching account, ordered by name.
 */
export async function findDiscoverableAccounts(
  callerId: string,
  phones: string[],
  emails: string[],
  client: PoolClient,
): Promise<DiscoverableAccountRow[]> {
  if (phones.length === 0 && emails.length === 0) return [];
  return query<DiscoverableAccountRow>(
    `SELECT usr.*,
            CASE WHEN usr.phone = ANY($2::text[]) AND usr.phone_verified_at IS NOT NULL
                 THEN usr.phone END AS matched_phone,
            CASE WHEN lower(usr.email) = ANY($3::text[])
                 THEN lower(usr.email) END AS matched_email,
            EXISTS (SELECT 1 FROM friendships
                     WHERE user_id = $1 AND friend_id = usr.id) AS is_friend,
            EXISTS (SELECT 1 FROM friend_requests
                     WHERE requester_id = $1 AND recipient_id = usr.id) AS request_sent,
            EXISTS (SELECT 1 FROM friend_requests
                     WHERE requester_id = usr.id AND recipient_id = $1) AS request_received
       FROM users usr
      WHERE ((usr.phone = ANY($2::text[]) AND usr.phone_verified_at IS NOT NULL)
             OR lower(usr.email) = ANY($3::text[]))
        AND usr.contact_discovery IS TRUE
        AND usr.id <> $1
        AND usr.merged_into IS NULL
        AND usr.deleted_at IS NULL
        AND usr.suspended_at IS NULL
        AND NOT EXISTS (
              SELECT 1 FROM user_blocks
               WHERE (blocker_id = $1 AND blocked_id = usr.id)
                  OR (blocker_id = usr.id AND blocked_id = $1)
            )
      ORDER BY usr.name, usr.id`,
    [callerId, phones, emails],
    client,
  );
}

/**
 * Adds identifiers to the account's count for the current UTC day, but only
 * when the new total stays within the limit; earlier days are pruned in the
 * same statement. The conflict arm takes the row lock, so concurrent claims
 * serialize and can never overshoot together.
 *
 * @param userId - Account doing the lookup.
 * @param count - Distinct identifiers this lookup checks.
 * @param dailyLimit - Most identifiers one account may check in a day.
 * @param client - The lookup's transaction client.
 * @returns The day's total after the claim, or undefined when it would pass
 *   the limit (nothing is counted then).
 */
export async function claimLookupQuota(
  userId: string,
  count: number,
  dailyLimit: number,
  client: PoolClient,
): Promise<number | undefined> {
  const claimed = await queryOne<{ identifiers_checked: number }>(
    `WITH pruned AS (
       DELETE FROM contact_lookup_usage
        WHERE user_id = $1 AND usage_day < (now() AT TIME ZONE 'UTC')::date
     )
     INSERT INTO contact_lookup_usage (user_id, usage_day, identifiers_checked)
     SELECT $1, (now() AT TIME ZONE 'UTC')::date, $2::int
      WHERE $2::int <= $3::int
     ON CONFLICT (user_id, usage_day) DO UPDATE
        SET identifiers_checked = contact_lookup_usage.identifiers_checked + EXCLUDED.identifiers_checked
      WHERE contact_lookup_usage.identifiers_checked + EXCLUDED.identifiers_checked <= $3::int
     RETURNING identifiers_checked`,
    [userId, count, dailyLimit],
    client,
  );
  return claimed?.identifiers_checked;
}

/**
 * Reads how many identifiers the account has checked so far today (UTC).
 *
 * @param userId - Account to read.
 * @param client - Optional transaction client.
 * @returns Today's count; 0 when the account has not looked anything up.
 */
export async function readLookupUsage(userId: string, client?: PoolClient): Promise<number> {
  const usage = await queryOne<{ identifiers_checked: number }>(
    `SELECT identifiers_checked FROM contact_lookup_usage
      WHERE user_id = $1 AND usage_day = (now() AT TIME ZONE 'UTC')::date`,
    [userId],
    client,
  );
  return usage?.identifiers_checked ?? 0;
}

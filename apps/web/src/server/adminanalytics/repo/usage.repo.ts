/**
 * All SQL for the usage overview: product-wide counts for the operator.
 *
 * Every statement here selects counts, a display name, or a calendar day.
 * No statement selects an email, a phone number, an avatar, an amount of
 * money, a description, a group name or a user id, so there is no column
 * for a later layer to forget to drop: what the admin page must not show
 * never leaves the database. A display name that is itself contact
 * information is withheld here too (see DISPLAY_NAME).
 *
 * Payment methods are counted and nothing more. A method's name, its
 * details and the name a payment keeps of the method it was made with
 * (settlements.method_label) say where a person's money goes; they reach
 * only someone who owes that person, and this page is not that.
 */

import type { PoolClient } from "pg";
import { query, queryOne } from "@/server/common/db";

/**
 * Someone who has signed in, as opposed to a placeholder row created when a
 * member invited them. Tombstones left by account merges are neither.
 * Written for a `users usr` alias.
 */
const REGISTERED = `usr.merged_into IS NULL AND (usr.google_sub IS NOT NULL OR usr.password_hash IS NOT NULL)`;

/**
 * When someone joined: the moment they finished signing up. An invited
 * person's row is created when a friend first types their name, which can
 * be months before they arrive; onboarded_at is when they did. Falls back
 * to created_at for the rare account still mid-onboarding.
 */
const JOINED_AT = `COALESCE(usr.onboarded_at, usr.created_at)`;

/**
 * A person's display name, or '' when the name is itself a way to reach
 * them. Written for a `users usr` alias.
 *
 * A display name is free text the person typed, and "names only" is a
 * promise about what the operator sees, not about what a column is called.
 * Three cases are withheld:
 *
 * - it contains "@": an email address typed as a name;
 * - it is made of digits and phone punctuation: a number typed as a name;
 * - it equals the part of their email before the "@". Sign-in falls back to
 *   exactly that when Google supplies no name, and with the domain almost
 *   always guessable it is the address in all but name.
 *
 * The last case compares against the email inside the database and returns
 * only the verdict, so the address still never leaves it. It will also
 * withhold a real name that happens to match (someone called "Ani" at
 * ani@...), which costs the operator one name and is the right way round to
 * be wrong.
 */
const DISPLAY_NAME = `CASE
    WHEN usr.name LIKE '%@%' THEN ''
    WHEN usr.name ~ '^[+0-9 ().-]{7,}$' THEN ''
    WHEN usr.email IS NOT NULL
         AND lower(btrim(usr.name)) = lower(split_part(usr.email, '@', 1)) THEN ''
    ELSE usr.name
  END`;

/** Product-wide totals. */
export interface UsageTotalsRow {
  registered_user_count: number;
  invited_user_count: number;
  weekly_active_user_count: number;
  monthly_active_user_count: number;
  group_count: number;
  expense_count: number;
  deleted_expense_count: number;
  payment_count: number;
  receipt_scan_count: number;
  parsed_receipt_scan_count: number;
  comment_count: number;
  payment_method_count: number;
  payment_method_user_count: number;
}

/**
 * Reads every product-wide total in one statement.
 *
 * "Active" is anyone who did something that reaches the feed: the activity
 * table already records every such action with its actor, so it answers the
 * question without a tracking table of its own.
 *
 * @param activeDays - Trailing days that count as active for the week and the month.
 * @param client - The snapshot's client.
 * @returns The totals.
 */
export async function findUsageTotals(
  activeDays: { week: number; month: number },
  client: PoolClient,
): Promise<UsageTotalsRow> {
  const totals = await queryOne<UsageTotalsRow>(
    `SELECT
       (SELECT COUNT(*)::int FROM users usr WHERE ${REGISTERED}) AS registered_user_count,
       (SELECT COUNT(*)::int FROM users usr
         WHERE usr.merged_into IS NULL AND usr.google_sub IS NULL AND usr.password_hash IS NULL
       ) AS invited_user_count,
       (SELECT COUNT(DISTINCT act.actor_id)::int FROM activity act
         WHERE act.created_at >= now() - make_interval(days => $1)) AS weekly_active_user_count,
       (SELECT COUNT(DISTINCT act.actor_id)::int FROM activity act
         WHERE act.created_at >= now() - make_interval(days => $2)) AS monthly_active_user_count,
       (SELECT COUNT(*)::int FROM groups) AS group_count,
       (SELECT COUNT(*)::int FROM expenses) AS expense_count,
       (SELECT COUNT(*)::int FROM expenses WHERE deleted_at IS NOT NULL) AS deleted_expense_count,
       (SELECT COUNT(*)::int FROM settlements WHERE method <> 'offset') AS payment_count,
       (SELECT COUNT(*)::int FROM receipt_scans) AS receipt_scan_count,
       (SELECT COUNT(*)::int FROM receipt_scans WHERE outcome = 'parsed') AS parsed_receipt_scan_count,
       (SELECT COUNT(*)::int FROM comments) AS comment_count,
       (SELECT COUNT(*)::int FROM payment_methods) AS payment_method_count,
       (SELECT COUNT(DISTINCT user_id)::int FROM payment_methods) AS payment_method_user_count`,
    [activeDays.week, activeDays.month],
    client,
  );
  // A SELECT of scalar subqueries always returns exactly one row.
  return totals!;
}

/** How many expenses were added with one split type. */
export interface SplitTypeCountRow {
  split_type: string;
  count: number;
}

/**
 * Every expense ever added, by split type. Deleted expenses are included:
 * the question is what people added, and deleting one later does not mean
 * it was never used.
 *
 * @param client - The snapshot's client.
 * @returns One row per split type in use, most used first.
 */
export async function listExpenseSplitTypeCounts(client: PoolClient): Promise<SplitTypeCountRow[]> {
  return query<SplitTypeCountRow>(
    `SELECT split_type, COUNT(*)::int AS count
       FROM expenses
      GROUP BY split_type
      ORDER BY count DESC, split_type`,
    [],
    client,
  );
}

/** One metric's count for one week. */
export interface WeeklyCountRow {
  /** Which series the count belongs to. */
  metric: "users" | "expenses" | "payments" | "scans";
  /** The Monday the week starts on, "YYYY-MM-DD", UTC. */
  week_start: string;
  count: number;
}

/**
 * Weekly counts of new people, expenses, payments and receipt scans since
 * an instant, as one result set. Weeks start on Monday in UTC. A week with
 * nothing in it has no row; the caller fills the gaps.
 *
 * @param sinceInstant - RFC 3339 instant of the first week's Monday, 00:00 UTC.
 * @param client - The snapshot's client.
 * @returns One row per metric and week that has anything.
 */
export async function listWeeklyCounts(
  sinceInstant: string,
  client: PoolClient,
): Promise<WeeklyCountRow[]> {
  return query<WeeklyCountRow>(
    `SELECT 'users' AS metric,
            to_char(date_trunc('week', ${JOINED_AT} AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week_start,
            COUNT(*)::int AS count
       FROM users usr
      WHERE ${REGISTERED} AND ${JOINED_AT} >= $1
      GROUP BY week_start
     UNION ALL
     SELECT 'expenses',
            to_char(date_trunc('week', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week_start,
            COUNT(*)::int
       FROM expenses
      WHERE created_at >= $1
      GROUP BY week_start
     UNION ALL
     SELECT 'payments',
            to_char(date_trunc('week', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week_start,
            COUNT(*)::int
       FROM settlements
      WHERE created_at >= $1 AND method <> 'offset'
      GROUP BY week_start
     UNION ALL
     SELECT 'scans',
            to_char(date_trunc('week', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week_start,
            COUNT(*)::int
       FROM receipt_scans
      WHERE created_at >= $1
      GROUP BY week_start`,
    [sinceInstant],
    client,
  );
}

/** One person's usage: a name, a day, and counts. */
export interface UserUsageRow {
  /** Their display name; '' when it was withheld as contact information. */
  name: string;
  /** The day they finished signing up, "YYYY-MM-DD", UTC. */
  joined_on: string;
  /** Expenses they added, keyed by split type; empty when none. */
  expenses_by_split_type: Record<string, number>;
  payment_count: number;
  receipt_scan_count: number;
}

/**
 * The people who have signed in, newest first, each with what they have
 * done: expenses added (by split type), payments recorded, receipts scanned.
 *
 * The per-person counts are joined on the user id inside the database and
 * the id is not selected, so the rows that reach the process identify
 * nobody beyond the display name the person chose.
 *
 * @param limit - Most people to return.
 * @param client - The snapshot's client.
 * @returns One row per person.
 */
export async function listUserUsage(limit: number, client: PoolClient): Promise<UserUsageRow[]> {
  return query<UserUsageRow>(
    `SELECT ${DISPLAY_NAME} AS name,
            to_char(${JOINED_AT} AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS joined_on,
            COALESCE(added.by_split_type, '{}'::json) AS expenses_by_split_type,
            COALESCE(recorded.payment_count, 0) AS payment_count,
            COALESCE(scanned.receipt_scan_count, 0) AS receipt_scan_count
       FROM users usr
       LEFT JOIN (
         SELECT created_by, json_object_agg(split_type, expense_count) AS by_split_type
           FROM (
             SELECT created_by, split_type, COUNT(*)::int AS expense_count
               FROM expenses GROUP BY created_by, split_type
           ) per_type
          GROUP BY created_by
       ) added ON added.created_by = usr.id
       LEFT JOIN (
         SELECT recorded_by, COUNT(*)::int AS payment_count
           FROM settlements WHERE method <> 'offset' GROUP BY recorded_by
       ) recorded ON recorded.recorded_by = usr.id
       LEFT JOIN (
         SELECT user_id, COUNT(*)::int AS receipt_scan_count
           FROM receipt_scans GROUP BY user_id
       ) scanned ON scanned.user_id = usr.id
      WHERE ${REGISTERED}
      ORDER BY ${JOINED_AT} DESC, usr.id
      LIMIT $1`,
    [limit],
    client,
  );
}

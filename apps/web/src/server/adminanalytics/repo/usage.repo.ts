/**
 * All SQL for the usage overview: product-wide counts for the operator.
 *
 * Every statement here selects counts, a display name, or a calendar day.
 * No statement selects an email, a phone number, an avatar, an amount of
 * money, a description, a group name or a user id, so there is no column
 * for a later layer to forget to drop: what the admin page must not show
 * never leaves the database. A display name that is itself contact
 * information is withheld here too (see repo/displayName.ts).
 *
 * Payment methods are counted and nothing more. A method's name, its
 * details and the name a payment keeps of the method it was made with
 * (settlements.method_label) say where a person's money goes; they reach
 * only someone who owes that person, and this page is not that.
 */

import type { PoolClient } from "pg";
import { query, queryOne } from "@/server/common/db/db";
import { DISPLAY_NAME } from "@/server/adminanalytics/repo/displayName";

/**
 * A row that stands for a person: not a tombstone left by an account merge,
 * and not the identity-free stand-in that keeps a deleted account's share of
 * a shared ledger. Written for a `users usr` alias.
 */
const PERSON = `usr.merged_into IS NULL AND usr.deleted_at IS NULL`;

/** How someone proves who they are; a placeholder row has none of these. */
const SIGN_IN = `(usr.google_sub IS NOT NULL OR usr.apple_sub IS NOT NULL OR usr.password_hash IS NOT NULL)`;

/**
 * Someone who has signed in, as opposed to a placeholder row created when a
 * member invited them. Written for a `users usr` alias.
 */
const REGISTERED = `${PERSON} AND ${SIGN_IN}`;

/** A placeholder for someone a member invited who has never signed in. */
const INVITED = `${PERSON} AND NOT ${SIGN_IN}`;

/**
 * When someone joined: the moment they finished signing up. An invited
 * person's row is created when a friend first types their name, which can
 * be months before they arrive; onboarded_at is when they did. Falls back
 * to created_at for the rare account still mid-onboarding. Accounts older
 * than onboarding itself read created_at too (migration 1792838306857).
 */
const JOINED_AT = `COALESCE(usr.onboarded_at, usr.created_at)`;

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
  deleted_payment_count: number;
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
       (SELECT COUNT(*)::int FROM users usr WHERE ${INVITED}) AS invited_user_count,
       (SELECT COUNT(DISTINCT act.actor_id)::int FROM activity act
         WHERE act.created_at >= now() - make_interval(days => $1)) AS weekly_active_user_count,
       (SELECT COUNT(DISTINCT act.actor_id)::int FROM activity act
         WHERE act.created_at >= now() - make_interval(days => $2)) AS monthly_active_user_count,
       (SELECT COUNT(*)::int FROM groups) AS group_count,
       (SELECT COUNT(*)::int FROM expenses) AS expense_count,
       (SELECT COUNT(*)::int FROM expenses WHERE deleted_at IS NOT NULL) AS deleted_expense_count,
       (SELECT COUNT(*)::int FROM settlements WHERE method <> 'offset') AS payment_count,
       (SELECT COUNT(*)::int FROM settlements
         WHERE method <> 'offset' AND deleted_at IS NOT NULL) AS deleted_payment_count,
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

/** One metric's count for one period of the trend. */
export interface TrendCountRow {
  /** Which series the count belongs to. */
  metric: "users" | "expenses" | "payments" | "scans";
  /** The period's first day, "YYYY-MM-DD", UTC. */
  period_start: string;
  count: number;
}

/**
 * Counts of new people, expenses, payments and receipt scans per week or
 * per month inside a window, as one result set. Periods start on Monday or
 * on the 1st, in UTC. A period with nothing in it has no row; the caller
 * fills the gaps.
 *
 * The unit reaches date_trunc as a parameter, never spliced into the text,
 * and the caller passes only "week" or "month".
 *
 * @param unit - "week" or "month".
 * @param window - RFC 3339 instants: the first period's start, and the
 *   start of the period after the last (exclusive).
 * @param client - The snapshot's client.
 * @returns One row per metric and period that has anything.
 */
export async function listTrendCounts(
  unit: "week" | "month",
  window: { fromInstant: string; untilInstant: string },
  client: PoolClient,
): Promise<TrendCountRow[]> {
  return query<TrendCountRow>(
    `SELECT 'users' AS metric,
            to_char(date_trunc($1, ${JOINED_AT} AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_start,
            COUNT(*)::int AS count
       FROM users usr
      WHERE ${REGISTERED} AND ${JOINED_AT} >= $2 AND ${JOINED_AT} < $3
      GROUP BY period_start
     UNION ALL
     SELECT 'expenses',
            to_char(date_trunc($1, created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_start,
            COUNT(*)::int
       FROM expenses
      WHERE created_at >= $2 AND created_at < $3
      GROUP BY period_start
     UNION ALL
     SELECT 'payments',
            to_char(date_trunc($1, created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_start,
            COUNT(*)::int
       FROM settlements
      WHERE created_at >= $2 AND created_at < $3 AND method <> 'offset'
      GROUP BY period_start
     UNION ALL
     SELECT 'scans',
            to_char(date_trunc($1, created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_start,
            COUNT(*)::int
       FROM receipt_scans
      WHERE created_at >= $2 AND created_at < $3
      GROUP BY period_start`,
    [unit, window.fromInstant, window.untilInstant],
    client,
  );
}

/**
 * The first instant anything the trend counts happened: someone joining,
 * an expense, a payment or a receipt scan. LEAST skips the sources with
 * nothing in them.
 *
 * @param client - The snapshot's client.
 * @returns RFC 3339 instant, or null when nothing has happened yet.
 */
export async function findFirstActivity(client: PoolClient): Promise<string | null> {
  const first = await queryOne<{ first_at: string | null }>(
    `SELECT LEAST(
       (SELECT MIN(${JOINED_AT}) FROM users usr WHERE ${REGISTERED}),
       (SELECT MIN(created_at) FROM expenses),
       (SELECT MIN(created_at) FROM settlements WHERE method <> 'offset'),
       (SELECT MIN(created_at) FROM receipt_scans)
     ) AS first_at`,
    [],
    client,
  );
  return first?.first_at ?? null;
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
 * The people are picked first and each one's rows are counted through the
 * author indexes, so the cost follows the length of the list rather than
 * the size of the expense, payment and scan tables.
 *
 * @param limit - Most people to return.
 * @param client - The snapshot's client.
 * @returns One row per person.
 */
export async function listUserUsage(limit: number, client: PoolClient): Promise<UserUsageRow[]> {
  return query<UserUsageRow>(
    `WITH chosen AS (
       SELECT usr.* FROM users usr
        WHERE ${REGISTERED}
        ORDER BY ${JOINED_AT} DESC, usr.id
        LIMIT $1
     )
     SELECT ${DISPLAY_NAME} AS name,
            to_char(${JOINED_AT} AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS joined_on,
            COALESCE(added.by_split_type, '{}'::json) AS expenses_by_split_type,
            recorded.payment_count,
            scanned.receipt_scan_count
       FROM chosen usr
       LEFT JOIN LATERAL (
         SELECT json_object_agg(per_type.split_type, per_type.expense_count) AS by_split_type
           FROM (
             SELECT split_type, COUNT(*)::int AS expense_count
               FROM expenses WHERE created_by = usr.id GROUP BY split_type
           ) per_type
       ) added ON true
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS payment_count
           FROM settlements WHERE recorded_by = usr.id AND method <> 'offset'
       ) recorded
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS receipt_scan_count
           FROM receipt_scans WHERE user_id = usr.id
       ) scanned
      ORDER BY ${JOINED_AT} DESC, usr.id`,
    [limit],
    client,
  );
}

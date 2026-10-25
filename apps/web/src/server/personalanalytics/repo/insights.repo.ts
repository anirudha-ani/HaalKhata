/**
 * All SQL for a person's own insights: aggregates over the expenses and
 * payments they are on. Read-only, and every statement starts from the
 * caller's own split and payer rows, so no query here can reach a ledger
 * the caller is not part of.
 */

import type { PoolClient } from "pg";
import { query, queryOne } from "@/server/common/db/db";
import { PAYMENT_KEY } from "@/server/common/ledger/paymentKey";

/** The bounds every windowed statement shares. */
export interface InsightBounds {
  /** First calendar day inside the window, "YYYY-MM-DD". */
  startDate: string;
  /** First calendar day after the window, "YYYY-MM-DD". */
  endDate: string;
}

/**
 * The live expenses a person is on inside the window, one row each, with
 * their share of it and what they paid up front.
 *
 * Driven from the person's own split and payer rows (both indexed by user)
 * and joined to expenses by primary key, so the cost follows the size of
 * their history rather than the size of the table. A person can be both a
 * payer and an ower of one expense, hence the union and the regroup.
 *
 * `expense_date` is the calendar day the person chose, stored as
 * "YYYY-MM-DD" text, so the window is a plain text range and needs no
 * timezone. Parameters: $1 user id, $2 start date, $3 end date.
 *
 * MATERIALIZED, so a statement that reads `mine` more than once walks the
 * history once and reads the result back.
 */
const MY_EXPENSES = `
  WITH involvement AS (
    SELECT spl.expense_id, spl.owed_cents AS share_cents, 0 AS paid_cents
      FROM expense_splits spl WHERE spl.user_id = $1
    UNION ALL
    SELECT pay.expense_id, 0 AS share_cents, pay.amount_cents AS paid_cents
      FROM expense_payers pay WHERE pay.user_id = $1
  ), mine AS MATERIALIZED (
    SELECT exp.id, exp.group_id, exp.currency, exp.category, exp.split_type, exp.expense_date,
           SUM(inv.share_cents)::bigint AS share_cents,
           SUM(inv.paid_cents)::bigint AS paid_cents
      FROM involvement inv JOIN expenses exp ON exp.id = inv.expense_id
     WHERE exp.deleted_at IS NULL AND exp.expense_date >= $2 AND exp.expense_date < $3
     GROUP BY exp.id
  )`;

/** Lifetime figures for one person. Sums arrive as text: pg does not narrow BIGINT. */
export interface JourneyRow {
  /** When they finished signing up, falling back to when their row was made. */
  member_since: string;
  default_currency: string;
  expense_count: number;
  /** Earliest "YYYY-MM-DD" of a live expense they are on; null when none. */
  first_expense_date: string | null;
  payment_count: number;
  group_count: number;
  friend_count: number;
  receipt_scan_count: number;
}

/**
 * Reads a person's lifetime figures in one statement.
 *
 * A payment counts once however many balances it settled: it is stored as
 * a row per place it paid down, and those rows are grouped by PAYMENT_KEY.
 *
 * @param userId - The person asking about themselves.
 * @param client - The snapshot's client.
 * @returns Their figures, or undefined when the account no longer exists.
 */
export async function findJourney(
  userId: string,
  client: PoolClient,
): Promise<JourneyRow | undefined> {
  return queryOne<JourneyRow>(
    `SELECT COALESCE(usr.onboarded_at, usr.created_at) AS member_since,
            usr.default_currency,
            ledger.expense_count,
            ledger.first_expense_date,
            (SELECT COUNT(*)::int FROM (
               SELECT 1 FROM settlements stl
                WHERE (stl.from_user = usr.id OR stl.to_user = usr.id)
                  AND stl.deleted_at IS NULL AND stl.method <> 'offset'
                GROUP BY ${PAYMENT_KEY}
             ) payment) AS payment_count,
            (SELECT COUNT(*)::int FROM group_members mem
              WHERE mem.user_id = usr.id) AS group_count,
            (SELECT COUNT(*)::int FROM friendships fnd
              WHERE fnd.user_id = usr.id) AS friend_count,
            (SELECT COUNT(*)::int FROM receipt_scans scan
              WHERE scan.user_id = usr.id AND scan.outcome = 'parsed') AS receipt_scan_count
       FROM users usr
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS expense_count, MIN(exp.expense_date) AS first_expense_date
           FROM expenses exp
          WHERE exp.deleted_at IS NULL
            AND exp.id IN (
              SELECT spl.expense_id FROM expense_splits spl WHERE spl.user_id = usr.id
              UNION
              SELECT pay.expense_id FROM expense_payers pay WHERE pay.user_id = usr.id
            )
       ) ledger
      WHERE usr.id = $1 AND usr.merged_into IS NULL`,
    [userId],
    client,
  );
}

/**
 * The window's expenses, grouped as finely as the dashboard ever slices
 * them: one row per currency, month, category, split type and group that
 * has any expense. Sums arrive as text: pg does not narrow BIGINT.
 */
export interface SpendingBreakdownRow {
  currency: string;
  /** "YYYY-MM". */
  month: string;
  category: string;
  split_type: string;
  /** Null for expenses outside any group. */
  group_id: string | null;
  group_name: string | null;
  group_type: string | null;
  /** Whether the person still belongs to that group; false outside any group. */
  is_member: boolean;
  share_cents: string;
  paid_cents: string;
  expense_count: number;
}

/** Someone the person shared expenses in one currency with in the window. */
export interface CompanionRow {
  currency: string;
  id: string;
  name: string;
  avatar_color: string;
  avatar_url: string | null;
  shared_expense_count: number;
}

/** The window's spending breakdown and the people split with, from one statement. */
export interface WindowInsightsRow {
  /** One row per combination that has any expense. */
  breakdown: SpendingBreakdownRow[];
  /** People by currency, most shared expenses first within each. */
  companions: CompanionRow[];
}

/**
 * Reads everything the window's charts and lists need in one statement,
 * which walks the person's split and payer history once.
 *
 * The spending, grouped by every dimension the dashboard shows it by: the
 * monthly chart, the category list, the split-type list and the list of
 * places are four regroupings of the same rows, left to the caller (a few
 * hundred rows at most). Group names and membership are joined after the
 * grouping, onto the handful of grouped rows rather than onto every
 * expense.
 *
 * Beside it, the people the person shared the most expenses with, ranked
 * within each currency: the dashboard shows one currency at a time, and a
 * trip in euros says nothing about who they split dollars with. Only the
 * four columns an avatar and a link need are read: this is a list of
 * people the caller already sees on those expenses, and it has no use for
 * anything else about them.
 *
 * Someone the caller blocked, or who blocked the caller, is left out, as the
 * activity feed leaves out their lines in both directions: a block means
 * neither sees the other turn up, and a ranking of who you split with
 * with their name and picture at the top is exactly that.
 *
 * So is a row that stands for nobody: the anonymous stand-in a deleted
 * account's share of a shared ledger now belongs to ("Deleted member"),
 * and a merge tombstone. Neither is someone to split with, and the link on
 * their avatar would lead to a friend page about no one.
 *
 * Both halves read `mine`, which is materialized once for the statement;
 * two statements would each walk the history. They come back as two JSON
 * arrays in one row, sums as text as everywhere else here.
 *
 * @param userId - The person asking about themselves.
 * @param bounds - The window's calendar-day range.
 * @param companionLimit - Most people to return per currency.
 * @param client - The snapshot's client.
 * @returns The breakdown and the companions.
 */
export async function listWindowInsights(
  userId: string,
  bounds: InsightBounds,
  companionLimit: number,
  client: PoolClient,
): Promise<WindowInsightsRow> {
  const result = await queryOne<WindowInsightsRow>(
    `${MY_EXPENSES}, breakdown AS (
       SELECT mine.currency, substr(mine.expense_date, 1, 7) AS month,
              mine.category, mine.split_type, mine.group_id,
              SUM(mine.share_cents)::bigint AS share_cents,
              SUM(mine.paid_cents)::bigint AS paid_cents,
              COUNT(*)::int AS expense_count
         FROM mine
        GROUP BY mine.currency, month, mine.category, mine.split_type, mine.group_id
     ), others AS (
       SELECT spl.user_id, spl.expense_id, mine.currency
         FROM expense_splits spl JOIN mine ON mine.id = spl.expense_id
        WHERE spl.user_id <> $1
       UNION
       SELECT pay.user_id, pay.expense_id, mine.currency
         FROM expense_payers pay JOIN mine ON mine.id = pay.expense_id
        WHERE pay.user_id <> $1
     ), counted AS (
       SELECT others.currency, usr.id, usr.name, usr.avatar_color, usr.avatar_url,
              COUNT(*)::int AS shared_expense_count
         FROM others JOIN users usr ON usr.id = others.user_id
        WHERE usr.deleted_at IS NULL AND usr.merged_into IS NULL
          AND NOT EXISTS (
          SELECT 1 FROM user_blocks blk
           WHERE (blk.blocker_id = $1 AND blk.blocked_id = usr.id)
              OR (blk.blocker_id = usr.id AND blk.blocked_id = $1)
        )
        GROUP BY others.currency, usr.id
     ), ranked AS (
       SELECT counted.*,
              ROW_NUMBER() OVER (
                PARTITION BY counted.currency
                ORDER BY counted.shared_expense_count DESC, counted.name, counted.id
              ) AS place
         FROM counted
     )
     SELECT
       COALESCE((
         SELECT json_agg(json_build_object(
                  'currency', breakdown.currency,
                  'month', breakdown.month,
                  'category', breakdown.category,
                  'split_type', breakdown.split_type,
                  'group_id', breakdown.group_id,
                  'group_name', grp.name,
                  'group_type', grp.type,
                  'is_member', (mem.user_id IS NOT NULL),
                  'share_cents', breakdown.share_cents::text,
                  'paid_cents', breakdown.paid_cents::text,
                  'expense_count', breakdown.expense_count))
           FROM breakdown
           LEFT JOIN groups grp ON grp.id = breakdown.group_id
           LEFT JOIN group_members mem
                  ON mem.group_id = breakdown.group_id AND mem.user_id = $1
       ), '[]'::json) AS breakdown,
       COALESCE((
         SELECT json_agg(json_build_object(
                  'currency', ranked.currency,
                  'id', ranked.id,
                  'name', ranked.name,
                  'avatar_color', ranked.avatar_color,
                  'avatar_url', ranked.avatar_url,
                  'shared_expense_count', ranked.shared_expense_count)
                ORDER BY ranked.currency, ranked.place)
           FROM ranked
          WHERE ranked.place <= $4
       ), '[]'::json) AS companions`,
    [userId, bounds.startDate, bounds.endDate, companionLimit],
    client,
  );
  // A SELECT with no FROM always returns exactly one row.
  return result!;
}

/** What a person paid and was paid in one currency. */
export interface PaymentTotalsRow {
  currency: string;
  paid_cents: string;
  received_cents: string;
}

/**
 * Money a person paid and received settling up, per currency, since an
 * instant. A net settlement's cancelling entries moved no money and are
 * left out; removed payments are too.
 *
 * @param userId - The person asking about themselves.
 * @param sinceInstant - RFC 3339 instant the window opens.
 * @param client - The snapshot's client.
 * @returns One row per currency with any payment.
 */
export async function sumPayments(
  userId: string,
  sinceInstant: string,
  client: PoolClient,
): Promise<PaymentTotalsRow[]> {
  return query<PaymentTotalsRow>(
    `SELECT stl.currency,
            COALESCE(SUM(stl.amount_cents) FILTER (WHERE stl.from_user = $1), 0)::bigint AS paid_cents,
            COALESCE(SUM(stl.amount_cents) FILTER (WHERE stl.to_user = $1), 0)::bigint AS received_cents
       FROM settlements stl
      WHERE (stl.from_user = $1 OR stl.to_user = $1)
        AND stl.deleted_at IS NULL AND stl.method <> 'offset'
        AND stl.created_at >= $2
      GROUP BY stl.currency`,
    [userId, sinceInstant],
    client,
  );
}

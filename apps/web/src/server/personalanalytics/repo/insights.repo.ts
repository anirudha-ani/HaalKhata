/**
 * All SQL for a person's own insights: aggregates over the expenses and
 * payments they are on. Read-only, and every statement starts from the
 * caller's own split and payer rows, so no query here can reach a ledger
 * the caller is not part of.
 */

import type { PoolClient } from "pg";
import { query, queryOne } from "@/server/common/db";

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
 */
const MY_EXPENSES = `
  WITH involvement AS (
    SELECT spl.expense_id, spl.owed_cents AS share_cents, 0 AS paid_cents
      FROM expense_splits spl WHERE spl.user_id = $1
    UNION ALL
    SELECT pay.expense_id, 0 AS share_cents, pay.amount_cents AS paid_cents
      FROM expense_payers pay WHERE pay.user_id = $1
  ), mine AS (
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
            (SELECT COUNT(*)::int FROM settlements stl
              WHERE (stl.from_user = usr.id OR stl.to_user = usr.id)
                AND stl.deleted_at IS NULL AND stl.method <> 'offset') AS payment_count,
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

/** One currency's spending in one calendar month. */
export interface MonthlySpendingRow {
  currency: string;
  /** "YYYY-MM". */
  month: string;
  share_cents: string;
  paid_cents: string;
  expense_count: number;
}

/**
 * A person's share and outlay per currency per month of the window.
 *
 * @param userId - The person asking about themselves.
 * @param bounds - The window's calendar-day range.
 * @param client - The snapshot's client.
 * @returns One row per currency and month that has any expense.
 */
export async function listMonthlySpending(
  userId: string,
  bounds: InsightBounds,
  client: PoolClient,
): Promise<MonthlySpendingRow[]> {
  return query<MonthlySpendingRow>(
    `${MY_EXPENSES}
     SELECT mine.currency, substr(mine.expense_date, 1, 7) AS month,
            SUM(mine.share_cents)::bigint AS share_cents,
            SUM(mine.paid_cents)::bigint AS paid_cents,
            COUNT(*)::int AS expense_count
       FROM mine
      GROUP BY mine.currency, month`,
    [userId, bounds.startDate, bounds.endDate],
    client,
  );
}

/** One currency's spending in one expense category. */
export interface CategorySpendingRow {
  currency: string;
  category: string;
  share_cents: string;
  expense_count: number;
}

/**
 * A person's share per currency per category over the window.
 *
 * @param userId - The person asking about themselves.
 * @param bounds - The window's calendar-day range.
 * @param client - The snapshot's client.
 * @returns One row per currency and category that has any expense.
 */
export async function listCategorySpending(
  userId: string,
  bounds: InsightBounds,
  client: PoolClient,
): Promise<CategorySpendingRow[]> {
  return query<CategorySpendingRow>(
    `${MY_EXPENSES}
     SELECT mine.currency, mine.category,
            SUM(mine.share_cents)::bigint AS share_cents,
            COUNT(*)::int AS expense_count
       FROM mine
      GROUP BY mine.currency, mine.category`,
    [userId, bounds.startDate, bounds.endDate],
    client,
  );
}

/** How many of the window's expenses used one split type. */
export interface SplitTypeCountRow {
  split_type: string;
  expense_count: number;
}

/**
 * How the window's expenses were split.
 *
 * @param userId - The person asking about themselves.
 * @param bounds - The window's calendar-day range.
 * @param client - The snapshot's client.
 * @returns One row per split type in use, most used first.
 */
export async function listSplitTypeCounts(
  userId: string,
  bounds: InsightBounds,
  client: PoolClient,
): Promise<SplitTypeCountRow[]> {
  return query<SplitTypeCountRow>(
    `${MY_EXPENSES}
     SELECT mine.split_type, COUNT(*)::int AS expense_count
       FROM mine
      GROUP BY mine.split_type
      ORDER BY expense_count DESC, mine.split_type`,
    [userId, bounds.startDate, bounds.endDate],
    client,
  );
}

/** How many of the window's expenses happened in one place. */
export interface GroupActivityRow {
  /** Null for expenses outside any group. */
  group_id: string | null;
  name: string | null;
  type: string | null;
  expense_count: number;
}

/**
 * Where the window's expenses happened: the busiest groups, with expenses
 * outside any group as one row of their own.
 *
 * @param userId - The person asking about themselves.
 * @param bounds - The window's calendar-day range.
 * @param limit - Most rows to return.
 * @param client - The snapshot's client.
 * @returns Rows, busiest first.
 */
export async function listGroupActivity(
  userId: string,
  bounds: InsightBounds,
  limit: number,
  client: PoolClient,
): Promise<GroupActivityRow[]> {
  return query<GroupActivityRow>(
    `${MY_EXPENSES}
     SELECT mine.group_id, grp.name, grp.type, COUNT(*)::int AS expense_count
       FROM mine LEFT JOIN groups grp ON grp.id = mine.group_id
      GROUP BY mine.group_id, grp.name, grp.type
      ORDER BY expense_count DESC, grp.name NULLS LAST, mine.group_id
      LIMIT $4`,
    [userId, bounds.startDate, bounds.endDate, limit],
    client,
  );
}

/** Someone the person shared expenses with in the window. */
export interface CompanionRow {
  id: string;
  name: string;
  avatar_color: string;
  avatar_url: string | null;
  shared_expense_count: number;
}

/**
 * The people a person shared the most expenses with in the window.
 *
 * Only the four columns an avatar and a link need are read: this is a list
 * of people the caller already sees on those expenses, and it has no use
 * for anything else about them.
 *
 * @param userId - The person asking about themselves.
 * @param bounds - The window's calendar-day range.
 * @param limit - Most people to return.
 * @param client - The snapshot's client.
 * @returns People, most shared expenses first.
 */
export async function listCompanions(
  userId: string,
  bounds: InsightBounds,
  limit: number,
  client: PoolClient,
): Promise<CompanionRow[]> {
  return query<CompanionRow>(
    `${MY_EXPENSES}, others AS (
       SELECT spl.user_id, spl.expense_id
         FROM expense_splits spl JOIN mine ON mine.id = spl.expense_id
        WHERE spl.user_id <> $1
       UNION
       SELECT pay.user_id, pay.expense_id
         FROM expense_payers pay JOIN mine ON mine.id = pay.expense_id
        WHERE pay.user_id <> $1
     )
     SELECT usr.id, usr.name, usr.avatar_color, usr.avatar_url,
            COUNT(*)::int AS shared_expense_count
       FROM others JOIN users usr ON usr.id = others.user_id
      GROUP BY usr.id
      ORDER BY shared_expense_count DESC, usr.name, usr.id
      LIMIT $4`,
    [userId, bounds.startDate, bounds.endDate, limit],
    client,
  );
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

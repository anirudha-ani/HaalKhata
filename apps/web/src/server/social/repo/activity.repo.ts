/** All SQL for the activity table (audience-scoped feed events). */

import type { PoolClient } from "pg";
import { execute, newId, query } from "@/server/common/db";
import {
  ACTIVITY_CURSOR_ID_PATTERN,
  ACTIVITY_CURSOR_TIMESTAMP_PATTERN,
} from "@/server/social/social.constants";

/** A row from the activity table (column names mirror SQL). */
export interface ActivityRow {
  id: string;
  /** Group the event happened in; null for events outside any group. */
  group_id: string | null;
  /** User id of the person who performed the action. */
  actor_id: string;
  /** Event kind, e.g. "group_created", "member_added". */
  type: string;
  /** Human-readable feed line, pre-rendered at insert time. */
  message: string;
  /** In-app path the feed entry links to. */
  link: string;
  /** JSONB array of user ids allowed to see this event. */
  audience: string[];
  /** Money the event concerned, in cents; 0 when it concerned none. */
  amount_cents: number;
  /** ISO 4217 code for amount_cents; empty when there is no amount. */
  currency: string;
  /** For a settlement, the user who received the money; null otherwise. */
  credit_user_id: string | null;
  created_at: string;
}

/**
 * Records one activity feed event.
 *
 * @param input - Event data: owning group id (or null when not group
 *   scoped), acting user's id, event kind, pre-rendered message, in-app
 *   link, the list of user ids who may see the event, and — where the event
 *   concerned money — its amount, currency and (for settlements) who received it.
 * @param client - Transaction client when the event must commit with the
 *   change it announces; omitted, it autocommits.
 */
export async function insertActivity(
  input: {
    groupId: string | null;
    actorId: string;
    type: string;
    message: string;
    link: string;
    audience: string[];
    amountCents?: number;
    currency?: string;
    creditUserId?: string | null;
  },
  client?: PoolClient,
): Promise<void> {
  await execute(
    `INSERT INTO activity
       (id, group_id, actor_id, type, message, link, audience, amount_cents, currency, credit_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
    [
      newId(),
      input.groupId,
      input.actorId,
      input.type,
      input.message,
      input.link,
      JSON.stringify(input.audience),
      input.amountCents ?? 0,
      input.currency ?? "",
      input.creditUserId ?? null,
    ],
    client,
  );
}

/** One page of feed rows plus the cursor that continues it. */
export interface ActivityPage {
  /** The rows, newest first. */
  rows: ActivityRow[];
  /** Cursor for the next page; empty when the feed is exhausted. */
  nextCursor: string;
}

/** A decoded keyset cursor: the created_at and id of the last row returned. */
interface ActivityCursor {
  createdAt: string;
  id: string;
}

/**
 * Encodes a keyset cursor. The pair is opaque to the client but readable
 * here, which beats base64 for debugging a feed that skipped a row.
 *
 * @param row - The last row of the page just returned.
 * @returns The cursor string to hand back to the client.
 */
function encodeCursor(lastRow: ActivityRow): string {
  return `${lastRow.created_at}|${lastRow.id}`;
}

/**
 * Decodes a cursor produced by {@link encodeCursor}.
 *
 * @param cursor - The client-supplied cursor; may be empty or malformed.
 * @returns The decoded pair, or null to start from the newest event.
 */
function decodeCursor(cursor: string): ActivityCursor | null {
  const separator = cursor.lastIndexOf("|");
  if (separator <= 0) return null;
  const createdAt = cursor.slice(0, separator);
  const cursorId = cursor.slice(separator + 1);
  if (
    !ACTIVITY_CURSOR_TIMESTAMP_PATTERN.test(createdAt) ||
    !ACTIVITY_CURSOR_ID_PATTERN.test(cursorId)
  ) {
    return null;
  }
  const parsedTimestamp = new Date(createdAt);
  if (Number.isNaN(parsedTimestamp.getTime()) || parsedTimestamp.toISOString() !== createdAt) {
    return null;
  }
  return { createdAt, id: cursorId };
}

/**
 * Builds the shared WHERE fragments for a feed query: the keyset cursor and
 * the optional calendar-month window.
 *
 * @param params - Cursor and month, plus the next free placeholder number.
 * @returns SQL fragment and the values to append to the parameter list.
 */
function feedWindow(params: {
  cursor: string;
  month: string;
  nextPlaceholder: number;
}): { clause: string; values: (string | number)[] } {
  const values: (string | number)[] = [];
  let placeholder = params.nextPlaceholder;
  let clause = "";

  const decoded = decodeCursor(params.cursor);
  if (decoded) {
    // Row-value comparison: strictly older than the last row returned, with
    // id breaking ties so events sharing a timestamp are never skipped.
    clause += ` AND (created_at, id) < ($${placeholder}, $${placeholder + 1})`;
    values.push(decoded.createdAt, decoded.id);
    placeholder += 2;
  }
  if (/^\d{4}-\d{2}$/.test(params.month)) {
    clause += ` AND to_char(created_at, 'YYYY-MM') = $${placeholder}`;
    values.push(params.month);
    placeholder += 1;
  }
  return { clause, values };
}

/**
 * Reads one page of the feed, newest first.
 *
 * Fetches `limit + 1` rows so "is there more?" is answered without a second
 * count query, then trims the extra before returning.
 *
 * @param scope - The viewing user, and optionally a group to narrow to.
 * @param options - Page size, keyset cursor, and optional "YYYY-MM" month.
 * @returns The page's rows and the cursor that continues it.
 */
export async function listActivityPage(
  scope: { userId: string; groupId?: string },
  options: { limit: number; cursor: string; month: string },
): Promise<ActivityPage> {
  // audience (a JSONB array; containment matches membership) governs BOTH
  // scopes: a group id narrows *where*, never *who may see*. A transaction
  // between two other members does not become yours by opening the group's
  // tab instead of your feed.
  const base = scope.groupId
    ? {
        clause: "group_id = $1 AND audience @> to_jsonb($2::text)",
        values: [scope.groupId, scope.userId],
      }
    : { clause: "audience @> to_jsonb($1::text)", values: [scope.userId] };
  const window = feedWindow({ ...options, nextPlaceholder: base.values.length + 1 });
  const limitPlaceholder = base.values.length + 1 + window.values.length;

  const rows = await query<ActivityRow>(
    `SELECT * FROM activity
     WHERE ${base.clause}${window.clause}
     ORDER BY created_at DESC, id DESC
     LIMIT $${limitPlaceholder}`,
    [...base.values, ...window.values, options.limit + 1],
  );

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  return {
    rows: page,
    nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : "",
  };
}

/**
 * The calendar months that actually contain activity in a scope, newest
 * first. Drives the month filter, which would otherwise have to offer every
 * month since the epoch and be mostly empty.
 *
 * @param scope - The viewing user, and optionally a group to narrow to.
 * @returns Month keys in "YYYY-MM" form, newest first.
 */
export async function listActivityMonths(scope: {
  userId: string;
  groupId?: string;
}): Promise<string[]> {
  // Same visibility rule as the pages themselves — see listActivityPage.
  const base = scope.groupId
    ? {
        clause: "group_id = $1 AND audience @> to_jsonb($2::text)",
        values: [scope.groupId, scope.userId],
      }
    : { clause: "audience @> to_jsonb($1::text)", values: [scope.userId] };
  const rows = await query<{ month: string }>(
    `SELECT DISTINCT to_char(created_at, 'YYYY-MM') AS month
     FROM activity WHERE ${base.clause}
     ORDER BY month DESC`,
    base.values,
  );
  return rows.map((monthRow) => monthRow.month);
}

/**
 * Every recorded change to one expense, oldest first.
 *
 * Matched on `link` rather than a foreign key because that is what ties an
 * activity row to an expense in this schema — `insertActivity` writes
 * `/expenses/<id>` for both the added and updated events. An exact equality
 * match, not a LIKE, so it cannot collide with another row.
 *
 * Deletions are excluded by construction: their link points at the group or
 * the friends list, since the expense they describe no longer has a page.
 *
 * @param expenseId - Expense whose history to read.
 * @returns Activity rows for that expense, oldest first.
 */
export async function listActivityForExpense(expenseId: string): Promise<ActivityRow[]> {
  return query<ActivityRow>(
    `SELECT * FROM activity
      WHERE link = $1
        AND type IN ('expense_added', 'expense_updated', 'expense_deleted')
      ORDER BY created_at ASC, id ASC`,
    [`/expenses/${expenseId}`],
  );
}

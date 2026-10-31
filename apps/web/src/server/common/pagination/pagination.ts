/**
 * Keyset paging shared by every paged list: how big a page is, how a
 * position in a list becomes an opaque cursor and back, and how a timestamp
 * is read precisely enough to be part of one.
 *
 * A cursor names the last row a page returned; the next page is every row
 * strictly after it in the list's order. Unlike an offset, rows added while
 * someone pages cannot shift the window, so nothing is listed twice or
 * skipped.
 */

import {
  EXACT_TIMESTAMP_PATTERN,
  MAX_CURSOR_LENGTH,
  MAX_CURSOR_VALUE_LENGTH,
} from "./pagination.constants";

/**
 * The number of rows a page holds: the requested size within [1, max], or
 * the list's default when none was asked for.
 *
 * @param requested - The client's `limit`; 0 or less means "the default".
 * @param defaultSize - The list's own page size.
 * @param maxSize - The most one page may hold.
 * @returns The page size to use.
 */
export function pageSize(requested: number, defaultSize: number, maxSize: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return defaultSize;
  return Math.min(Math.floor(requested), maxSize);
}

/**
 * Encodes a position in a list as an opaque cursor.
 *
 * @param parts - The values of the list's order key for the last row returned.
 * @returns A URL-safe string to hand to the client.
 */
export function encodeCursor(parts: readonly string[]): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

/**
 * Decodes a cursor made by {@link encodeCursor}.
 *
 * @param cursor - The client's cursor.
 * @param partCount - How many values the list's order key has.
 * @returns The values, or null when the cursor is not one of ours.
 */
export function decodeCursor(cursor: string, partCount: number): string[] | null {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) return null;
  try {
    const parts: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Array.isArray(parts) ||
      parts.length !== partCount ||
      !parts.every((part) => typeof part === "string")
    ) {
      return null;
    }
    return parts as string[];
  } catch {
    return null;
  }
}

/**
 * Whether a cursor value is a real UTC instant spelled to the microsecond.
 *
 * @param value - The value to check.
 * @returns True for a timestamp {@link exactTimeSql} could have produced.
 */
export function isExactTimestamp(value: string): boolean {
  if (!EXACT_TIMESTAMP_PATTERN.test(value)) return false;
  // A Date holds milliseconds, so the real-instant check runs on the value
  // cut to them; "2026-02-30" parses, rolls over, and is caught here.
  const millisecondSpelling = `${value.slice(0, 23)}Z`;
  const parsed = new Date(millisecondSpelling);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === millisecondSpelling;
}

/**
 * Whether a cursor value can be a stored text value: a row id, or a day as
 * an expense stores it. Both are compared as text, so any short string is
 * safe to send; nothing is cast.
 *
 * @param value - The value to check.
 * @returns True for a non-empty value of a plausible length.
 */
export function isCursorValue(value: string): boolean {
  return value.length > 0 && value.length <= MAX_CURSOR_VALUE_LENGTH;
}

/**
 * SQL for a timestamptz column in UTC to the microsecond. A value read the
 * ordinary way becomes a JavaScript Date and loses its last three digits, so
 * a cursor built from it would sort before rows later in that millisecond
 * and the next page would skip them.
 *
 * @param column - The column, as the query names it.
 * @returns The expression, spelled "YYYY-MM-DDTHH:MM:SS.ffffffZ".
 */
export function exactTimeSql(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

/**
 * SQL for the UTC day of a timestamptz column, spelled like an expense date
 * ("YYYY-MM-DD") and compared byte by byte, so it sorts with expense dates
 * in one order — the one JavaScript string comparison keeps.
 *
 * @param column - The column, as the query names it.
 * @returns The expression, collated "C".
 */
export function utcDaySql(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD') COLLATE "C"`;
}

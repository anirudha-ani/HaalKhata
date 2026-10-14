/** Pure calendar math for an insights window: which months it covers and where it starts and ends. */

import {
  CALENDAR_MONTH_PATTERN,
  DEFAULT_INSIGHT_MONTHS,
  MAX_HOURS_AHEAD_OF_UTC,
  MAX_HOURS_BEHIND_UTC,
  MAX_INSIGHT_MONTHS,
} from "@/server/personalanalytics/personalanalytics.constants";

/** Milliseconds in an hour. */
const HOUR_MS = 60 * 60 * 1000;

/** A trailing run of whole calendar months. */
export interface InsightWindow {
  /** The months covered, "YYYY-MM", oldest first, no gaps. */
  months: string[];
  /** First calendar day inside the window, "YYYY-MM-DD". */
  startDate: string;
  /** First calendar day after the window, "YYYY-MM-DD". */
  endDate: string;
  /** The instant the window opens, for rows that record a moment rather than a day. */
  startInstant: string;
}

/**
 * The "YYYY-MM" a UTC instant falls in.
 *
 * @param instant - The moment to read.
 * @returns Its UTC calendar month.
 */
function utcMonth(instant: Date): string {
  return instant.toISOString().slice(0, 7);
}

/**
 * Steps a "YYYY-MM" key by whole months.
 *
 * @param month - The month to start from.
 * @param offset - Months to move; negative goes back.
 * @returns The resulting "YYYY-MM".
 */
function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return utcMonth(new Date(Date.UTC(year, monthNumber - 1 + offset, 1)));
}

/**
 * Bounds the requested window size.
 *
 * @param requestedMonths - What the client sent; 0 or less means "default".
 * @returns A whole number of months the server is willing to aggregate.
 */
export function clampInsightMonths(requestedMonths: number): number {
  if (!Number.isInteger(requestedMonths) || requestedMonths <= 0) return DEFAULT_INSIGHT_MONTHS;
  return Math.min(requestedMonths, MAX_INSIGHT_MONTHS);
}

/**
 * Decides which calendar month is "this month" for the person asking.
 *
 * The server's clock is UTC, where a month ends up to 12 hours before or 14
 * hours after it does on the caller's wall. The client says which month it
 * is in, and that is believed exactly when some real timezone is in that
 * month right now, so the claim can move the window by at most the one month
 * a timezone could, and a malformed or stale value changes nothing.
 *
 * @param localMonth - The client's "YYYY-MM"; may be empty or nonsense.
 * @param nowTime - The server's current time.
 * @returns The month to end the window on.
 */
export function resolveCurrentMonth(localMonth: string, nowTime: Date): string {
  const serverMonth = utcMonth(nowTime);
  if (!CALENDAR_MONTH_PATTERN.test(localMonth)) return serverMonth;
  const earliest = utcMonth(new Date(nowTime.getTime() - MAX_HOURS_BEHIND_UTC * HOUR_MS));
  const latest = utcMonth(new Date(nowTime.getTime() + MAX_HOURS_AHEAD_OF_UTC * HOUR_MS));
  return localMonth === earliest || localMonth === latest ? localMonth : serverMonth;
}

/**
 * Builds the trailing window of whole calendar months ending in the caller's
 * current month.
 *
 * @param nowTime - The server's current time.
 * @param requestedMonths - Window size the client asked for.
 * @param localMonth - The client's current "YYYY-MM"; see {@link resolveCurrentMonth}.
 * @returns The months covered and the bounds to query with.
 */
export function insightWindow(
  nowTime: Date,
  requestedMonths: number,
  localMonth: string,
): InsightWindow {
  const size = clampInsightMonths(requestedMonths);
  const currentMonth = resolveCurrentMonth(localMonth, nowTime);
  const months = Array.from({ length: size }, (_unused, index) =>
    shiftMonth(currentMonth, index - (size - 1)),
  );
  const startDate = `${months[0]}-01`;
  return {
    months,
    startDate,
    endDate: `${shiftMonth(currentMonth, 1)}-01`,
    // Payments record a UTC instant, not a day the person chose. The window
    // opens at the UTC start of its first month; the few hours by which that
    // differs from the caller's own midnight fall on the far, oldest edge.
    startInstant: `${startDate}T00:00:00.000Z`,
  };
}

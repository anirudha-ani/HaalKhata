/** Personal analytics domain constants. */

/** Months an insights window covers when the client does not ask for a size. */
export const DEFAULT_INSIGHT_MONTHS = 6;

/**
 * Longest window a client can ask for. Two years is as far back as a
 * month-by-month chart stays readable, and it bounds how much of a long
 * ledger one request aggregates.
 */
export const MAX_INSIGHT_MONTHS = 24;

/** "YYYY-MM" with a real month number. */
export const CALENDAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * How far behind UTC local time can be (UTC-12, Baker Island). With
 * {@link MAX_HOURS_AHEAD_OF_UTC} this bounds which calendar months a client
 * can truthfully say it is in.
 */
export const MAX_HOURS_BEHIND_UTC = 12;

/** How far ahead of UTC local time can be (UTC+14, Kiritimati). */
export const MAX_HOURS_AHEAD_OF_UTC = 14;

/** Most people listed under "who you split with". */
export const TOP_COMPANION_LIMIT = 5;

/** Most places listed under "where you split", the outside-groups row included. */
export const TOP_GROUP_LIMIT = 5;

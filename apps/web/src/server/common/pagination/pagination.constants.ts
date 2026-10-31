/** Constants for keyset paging: cursor shapes and the refusal for a cursor that cannot be used. */

/** A UTC instant to the microsecond, as {@link exactTimeSql} spells it. */
export const EXACT_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/**
 * Longest text value a cursor may carry: a row id (a UUID or shorter) or a
 * day as an expense stores it.
 */
export const MAX_CURSOR_VALUE_LENGTH = 128;

/** Longest cursor accepted at all, measured before it is decoded. */
export const MAX_CURSOR_LENGTH = 2048;

/**
 * The answer to a cursor that is malformed, forged, or for another list.
 * Refused rather than ignored: starting again from the top would hand a
 * client rows it already shows, and it would list them twice.
 */
export const STALE_CURSOR_MESSAGE = "that page of the list is no longer available — reload it";

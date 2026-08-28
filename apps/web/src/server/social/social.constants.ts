/** Social domain constants. */

/**
 * How long before the same person can be reminded about the same debt again.
 * A nudge is welcome; a stream of them is harassment, and the sender is not
 * the one who experiences the difference — so the limit is enforced here
 * rather than left to the UI.
 */
export const REMINDER_COOLDOWN_HOURS = 24;

/** Events per activity page when the client does not ask for a size. */
export const ACTIVITY_PAGE_SIZE = 25;

/** Hard ceiling on an activity page, so a client cannot ask for the whole table. */
export const MAX_ACTIVITY_PAGE_SIZE = 100;

/** Canonical UTC timestamp spelling emitted by the database boundary. */
export const ACTIVITY_CURSOR_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** UUID shape generated for every activity row id. */
export const ACTIVITY_CURSOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

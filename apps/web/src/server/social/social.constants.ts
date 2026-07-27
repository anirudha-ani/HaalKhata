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

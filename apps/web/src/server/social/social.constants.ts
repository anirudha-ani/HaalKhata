/** Social domain constants. */

/**
 * How long before the same person can be reminded about the same debt again.
 * A nudge is welcome; a stream of them is harassment, and the sender is not
 * the one who experiences the difference — so the limit is enforced here
 * rather than left to the UI.
 */
export const REMINDER_COOLDOWN_HOURS = 24;

/** Constants for the participant picker. */

/**
 * Most friend rows rendered at once. Someone with 300 friends gets a list they
 * cannot scan and 300 DOM nodes they did not ask for; past this the picker
 * shows a count and asks them to keep typing, which is faster than scrolling.
 * Selected people are never hidden by it — they stay visible as chips.
 */
export const MAX_VISIBLE_FRIENDS = 50;

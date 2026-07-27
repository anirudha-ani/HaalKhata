/** Constants for the person picker. */

/**
 * Most rows rendered at once. Someone with 300 friends gets a list they cannot
 * scan and 300 views they did not ask for; past this the picker shows a count
 * and asks them to keep typing, which is faster than scrolling.
 */
export const MAX_VISIBLE_PEOPLE = 50;

/**
 * Number of people above which the list gets its own scroll container. Below
 * it the list is short enough to sit inline in the sheet.
 */
export const SCROLLING_LIST_THRESHOLD = 6;

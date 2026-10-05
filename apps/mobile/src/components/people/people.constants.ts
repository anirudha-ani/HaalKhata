/** Constants for the person picker. */

/**
 * Most rows rendered at once. Someone with 300 friends gets a list they cannot
 * scan and 300 views they did not ask for; past this the picker shows a count
 * and asks them to keep typing, which is faster than scrolling.
 */
export const MAX_VISIBLE_PEOPLE = 50;

/**
 * Height cap of the person list, about five rows. The list never grows the
 * screen: a picker that pushes the amount, date and split off screen as the
 * friend count grows is a picker that gets worse with use.
 */
export const LIST_MAX_HEIGHT = 240;

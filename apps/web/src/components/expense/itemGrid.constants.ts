/** Constants for the shared items × people grid. */

/**
 * Upper bound for a person's share weight on a single line item. Keeps a typo
 * from running away; the server accepts any positive weight.
 */
export const MAX_ASSIGNEE_WEIGHT = 99;

/** One-tap tip percentages offered under the grid, of the items subtotal. */
export const TIP_PERCENT_PRESETS = [10, 15, 18, 20];

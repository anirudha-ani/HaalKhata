/** Constants for the shared item cards (the itemized split editor). */

/**
 * Upper bound for a person's portion count on a single line item. Keeps a
 * runaway tap on the stepper from producing nonsense; the server accepts any
 * positive weight.
 */
export const MAX_ASSIGNEE_WEIGHT = 99;

/** Upper bound for the quantity the scanner may have read off one line. */
export const MAX_ITEM_QUANTITY = 999;

/** One-tap tip percentages offered under the items, of the items subtotal. */
export const TIP_PERCENT_PRESETS = [10, 15, 18, 20];

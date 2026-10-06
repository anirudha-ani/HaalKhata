/** Constants for the shared item cards (the itemized split editor). */

/**
 * Upper bound for a person's portion count on a single line item. Keeps a
 * runaway tap on the stepper from producing nonsense; the server accepts any
 * positive weight.
 */
export const MAX_ASSIGNEE_WEIGHT = 99;

/** Upper bound for the quantity the scanner may have read off one line. */
export const MAX_ITEM_QUANTITY = 999;

/**
 * Media query for the phone layout of the claim bar: everything below
 * Tailwind's `sm:` breakpoint (40rem), where the cards' own classes switch.
 */
export const PHONE_LAYOUT_MEDIA_QUERY = "(width < 40rem)";

/** One-tap tip percentages offered under the items, of the items subtotal. */
export const TIP_PERCENT_PRESETS = [10, 15, 18, 20];

/**
 * Shared input styling for the cards' text fields.
 *
 * `text-base` on phones is not a size preference: iOS Safari zooms the whole
 * page when a focused input's font is under 16px. It drops to `text-sm` from
 * `sm:` up, where no such rule applies.
 */
export const fieldClass =
  "h-10 min-w-0 rounded-lg border border-line bg-paper px-3 text-base focus:border-brand-500 focus:outline-none sm:h-9 sm:text-sm";

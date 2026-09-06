/** Shared presentational-UI constants used by components in this folder. */

/** Pixel dimensions and font size for each avatar size variant. */
export const AVATAR_SIZES = {
  sm: { diameter: 28, fontSize: 11 },
  md: { diameter: 36, fontSize: 14 },
  lg: { diameter: 48, fontSize: 16 },
} as const;

/** Fallback avatar background when a user has no accent color. */
export const AVATAR_FALLBACK_COLOR = "#857a68";

/** Fraction of the screen height a bottom sheet may occupy at most. */
export const SHEET_MAX_HEIGHT_RATIO = 0.92;

/**
 * Most country rows the phone field's picker renders at once. Search narrows
 * the list far faster than scrolling 240 rows, so past this it shows a count
 * and asks the user to keep typing.
 */
export const MAX_VISIBLE_COUNTRIES = 60;

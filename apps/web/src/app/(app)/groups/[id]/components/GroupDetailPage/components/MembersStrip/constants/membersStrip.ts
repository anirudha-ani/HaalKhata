/** Constants for the group page's members strip. */

/**
 * How many circles the strip's avatar stack may take, the "+N" count
 * included. Six fit beside the names on a phone with room to spare.
 */
export const MEMBERS_STRIP_AVATAR_SLOTS = 6;

/**
 * Shared styling for the strip's two outline actions. On a phone they split
 * their row evenly and are a little taller, since they are thumb targets
 * there; from `sm:` up they hug their labels beside the summary.
 */
export const stripActionClass =
  "flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50 sm:flex-none sm:py-1.5";

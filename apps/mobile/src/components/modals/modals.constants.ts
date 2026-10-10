/** Constants for the modal sheets. */

/**
 * How long the "Copied" confirmation stays on the copy button, in
 * milliseconds. Long enough to read, short enough that a second copy is
 * never waiting on it.
 */
export const COPIED_BADGE_MS = 1500;

/**
 * Key that marks the "Copy all" button as the one that last copied. A
 * detail's own key always contains a colon, so this cannot collide with one.
 */
export const COPY_ALL_KEY = "copy-all";

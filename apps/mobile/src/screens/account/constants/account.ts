/** Account-route constants. */

/**
 * How long the save button holds its confirmed state before returning to
 * "Save changes", in milliseconds. Long enough to read, short enough that a
 * second save is never waiting on it.
 */
export const SAVED_BADGE_MS = 1800;

/**
 * The keyboard each kind of payment detail is typed with. A phone has its
 * own field and an account type is a choice, so neither is listed.
 */
export const DETAIL_KEYBOARDS = {
  text: "default",
  email: "email-address",
  number: "number-pad",
  link: "url",
} as const;

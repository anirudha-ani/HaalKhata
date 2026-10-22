/** Account-route constants. */

/**
 * How long the save button holds its confirmed state before returning to
 * "Save changes", in milliseconds. Long enough to read, short enough that a
 * second save is never waiting on it.
 */
export const SAVED_BADGE_MS = 1800;

/**
 * Said after signing out while the server could not be reached. The phone
 * is signed out; the session ends on the server the next time the app is
 * opened online, and until then the account's notifications can still arrive.
 */
export const SIGN_OUT_OFFLINE = {
  title: "Signed out on this phone",
  message:
    "HaalKhata couldn't reach the server, so your session ends there the next time you open the app online. " +
    "Until then, notifications for this account may still arrive on this phone.",
} as const;

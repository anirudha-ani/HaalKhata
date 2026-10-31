/** Wording and timing of the screen a sign-out waits on. */

/** How often a sign-out that could not reach the server tries again. */
export const SIGN_OUT_RETRY_INTERVAL_MS = 5_000;

/** Why a sign-out has not finished, and that nothing further is needed. */
export const SIGN_OUT_STUCK_MESSAGE =
  "We can’t reach HaalKhata, so this browser is still signed in. Your details are off the screen, and we’ll finish signing you out as soon as the connection is back.";

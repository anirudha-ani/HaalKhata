/** Constants for the verify-phone banner. */

/**
 * Session-scoped, so the prompt returns on the next sign-in rather than
 * nagging forever within one visit or being dismissible for good — the point
 * is that an unverified number stays claimable by anyone proving possession
 * (§34), which does not stop being true because a banner was closed.
 */
export const DISMISS_KEY = "haalkhata-verify-phone-dismissed";

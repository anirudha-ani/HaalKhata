/** Telling a failed connection apart from an answer, and saying so plainly. */

import { ConnectError } from "@connectrpc/connect";

/** Said when a call never reached the server, in place of the browser's own wording. */
export const NO_CONNECTION_MESSAGE = "We couldn’t reach HaalKhata. Check your connection and try again.";

/**
 * Whether a call failed for want of a connection. Browsers and React Native
 * both reject a fetch that could not be made with a TypeError, whose text
 * ("Failed to fetch", "Network request failed") means nothing to a person.
 *
 * @param error - What the call threw.
 * @returns True when the server gave no answer at all.
 */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ConnectError && error.cause instanceof TypeError);
}

/** Tells an ended admin session apart from any other failed request. */

import { Code, ConnectError } from "@connectrpc/connect";

/**
 * Whether an error means the admin session is gone: expired, signed out
 * elsewhere, or its address removed from the allowlist.
 *
 * @param error - The value a query or mutation failed with.
 * @returns True when the fix is to sign in again.
 */
export function isSessionEnded(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.Unauthenticated;
}

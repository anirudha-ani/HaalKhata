/** Telling a statement page refused because the statement changed from any other failure — pure. */

import { Code, ConnectError } from "@connectrpc/connect";

/**
 * Whether a failed statement read was the server refusing an older page
 * because a line was added, edited or removed since the first page was
 * read. Asking again with the same cursor is refused again, so it is never
 * retried: the screen reads the whole statement again instead.
 *
 * @param failure - What the read threw.
 * @returns True for that refusal (failed_precondition).
 */
export function isStatementChanged(failure: unknown): boolean {
  return failure instanceof ConnectError && failure.code === Code.FailedPrecondition;
}

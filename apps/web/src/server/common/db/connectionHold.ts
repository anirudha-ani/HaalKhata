/**
 * Notices code that asks for a second database connection while its request
 * already holds one. A transaction (or snapshot) keeps its connection until
 * it ends; a pool query, snapshot or transaction started inside it waits for
 * another. Enough requests doing that at once hold every connection in the
 * pool while each waits for one more, and they all time out — taking every
 * other request in the app with them. Everything inside a transaction must
 * run on its client, one statement at a time.
 *
 * Outside production a second connection is refused with an error, so a test
 * or a developer finds the path at once; in production it is logged, so a
 * path no test reached still works while it is fixed.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { logError } from "@/server/common/logger";

/** Set, for the work inside a transaction, while its connection is held. */
const heldConnection = new AsyncLocalStorage<true>();

/** Asked for a second connection while holding one. */
export class SecondConnectionError extends Error {
  /**
   * @param request - What asked for it: "a pool query" or "a transaction".
   */
  constructor(request: string) {
    super(`${request} asked for a second database connection while this request already holds one; run it on the transaction's client`);
    this.name = "SecondConnectionError";
  }
}

/**
 * Runs a transaction's work marked as holding a connection.
 *
 * @param work - The transaction's work.
 * @returns What the work returns.
 */
export function whileHoldingConnection<Result>(work: () => Promise<Result>): Promise<Result> {
  return heldConnection.run(true, work);
}

/**
 * Refuses (outside production) or reports (in production) a request for a
 * connection made while one is already held.
 *
 * @param request - What is asking: "a pool query" or "a transaction".
 * @throws SecondConnectionError outside production, when a connection is held.
 */
export function refuseSecondConnection(request: string): void {
  if (heldConnection.getStore() === undefined) return;
  const error = new SecondConnectionError(request);
  if (process.env.NODE_ENV !== "production") throw error;
  logError(error, { scope: "db-second-connection" });
}

/**
 * Runs work as a separate request would, outside any connection this one
 * holds. For a test that plays two requests from one function — a
 * settlement committing in the middle of another request's read — where the
 * second would otherwise count as the first asking for another connection.
 *
 * @param work - The other request's work.
 * @returns What the work returns.
 */
export function asSeparateRequest<Result>(work: () => Promise<Result>): Promise<Result> {
  return heldConnection.exit(work);
}

/** A deadline for a request's body to arrive in full. */

import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Drops the connection of a request whose body has not fully arrived within
 * `timeoutMs`. A Connect request is read into memory before it is decoded,
 * so one that trickles in a byte at a time would otherwise hold its buffer
 * and its connection for as long as the sender likes. The deadline ends when
 * the body has been read, or when the response has gone out — a request the
 * gate refuses is answered without its body ever being read.
 *
 * @param request - The incoming request.
 * @param response - Its response.
 * @param timeoutMs - How long the body may take to arrive.
 */
export function enforceBodyDeadline(request: IncomingMessage, response: ServerResponse, timeoutMs: number): void {
  if (request.complete) return;
  const timer = setTimeout(() => {
    request.destroy(new Error(`request body did not arrive within ${timeoutMs} ms`));
  }, timeoutMs);
  // A pending deadline must never keep the process alive on its own.
  timer.unref();
  const clear = () => clearTimeout(timer);
  request.once("end", clear);
  request.once("close", clear);
  response.once("finish", clear);
  response.once("close", clear);
}

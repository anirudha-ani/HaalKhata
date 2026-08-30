/** Checked conversion of aggregate money into the int32 the wire carries. */

import { UsecaseError } from "./errors";
import { PROTO_INT32_MAX, PROTO_INT32_MIN } from "./money.constants";

/**
 * Passes an aggregate through only if the int32 wire field can carry it.
 *
 * Every stored amount is capped at 2,000,000,000 cents per row, but a sum
 * of rows is not, and two valid rows can already exceed what an int32
 * balance field represents. protobuf-es then throws inside the JSON
 * encoder and the caller sees an internal error with no indication of why.
 * Checking here turns that into a controlled, named failure the client can
 * show, while JavaScript's own numbers (exact to 2^53) stay correct
 * server-side.
 *
 * @param cents - The aggregate to send.
 * @param what - What the number is, for the message (e.g. "this balance").
 * @returns The same number, once it is known to fit.
 * @throws UsecaseError (failed_precondition) when it does not fit.
 */
export function toInt32Cents(cents: number, what: string): number {
  if (!Number.isSafeInteger(cents) || cents < PROTO_INT32_MIN || cents > PROTO_INT32_MAX) {
    throw new UsecaseError(
      "failed_precondition",
      `${what} is larger than this app can represent (more than 21,474,836.47 in one currency); split it across groups or currencies`,
    );
  }
  return cents;
}

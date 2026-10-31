/** Postgres 64-bit integers as exact JavaScript numbers. */

/**
 * Parses a BIGINT (money columns and their sums, ledger sequence numbers)
 * into a number. Every one the app stores or sums stays far below 2^53, so
 * the conversion is exact; one that is not is refused rather than rounded,
 * which fails the query instead of showing a wrong figure.
 *
 * @param text - The value as Postgres sends it.
 * @returns The same value as a number.
 * @throws RangeError when the value is beyond 2^53 − 1 either way.
 */
export function parseExactInt8(text: string): number {
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`a 64-bit value from the database (${text}) is beyond what a JavaScript number holds exactly`);
  }
  return value;
}

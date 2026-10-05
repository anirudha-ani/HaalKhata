/** Copies a record without one of its keys. */

/**
 * Returns a copy of `source` without `keyToDrop`.
 *
 * @param source - The record to copy.
 * @param keyToDrop - Key to leave out of the copy.
 * @returns A new record with every other entry of `source`.
 */
export function omitKey<Value>(source: Record<string, Value>, keyToDrop: string): Record<string, Value> {
  const { [keyToDrop]: _dropped, ...rest } = source;
  return rest;
}

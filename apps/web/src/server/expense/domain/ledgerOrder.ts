/**
 * The order of a friend statement's lines — pure. One strict order, used to
 * sort the whole history in memory and, with the same four values, by the
 * page queries in SQL, so a page always starts exactly where the last ended.
 */

/**
 * Where one statement line sits, oldest to newest: its day, the moment it
 * was written (to the microsecond), its kind's rank on that moment, its id.
 * No two lines share a key.
 */
export interface LedgerLineKey {
  /** "YYYY-MM-DD": an expense's own date; a payment's UTC day. */
  day: string;
  /** When the row was written, "YYYY-MM-DDTHH:MM:SS.ffffffZ". */
  at: string;
  /** Where its kind falls on one moment; see LEDGER_LINE_RANK. */
  rank: number;
  /** The row's id, settling everything else. */
  id: string;
}

/**
 * Compares two statement keys in the statement's order. Days and ids compare
 * as text by code point, which the SQL side matches with COLLATE "C".
 *
 * @param first - One key.
 * @param second - The other.
 * @returns < 0 when `first` is older, > 0 when newer, 0 for the same line.
 */
export function compareLedgerLineKeys(first: LedgerLineKey, second: LedgerLineKey): number {
  if (first.day !== second.day) return first.day < second.day ? -1 : 1;
  if (first.at !== second.at) return first.at < second.at ? -1 : 1;
  if (first.rank !== second.rank) return first.rank - second.rank;
  if (first.id !== second.id) return first.id < second.id ? -1 : 1;
  return 0;
}

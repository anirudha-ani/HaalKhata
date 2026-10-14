/** Entry change: what one statement line did to the reader's balance, signed and coloured. */

import type { FriendLedgerEntry } from "@haalkhata/protogen/expense/v1/expense_pb";
import { formatMoney } from "@haalkhata/shared/money/money";

/**
 * Renders a line's movement. This is the figure that matters on a statement:
 * an expense's total is context, the reader's share of it is the movement. A
 * removed line moved nothing, and shows a dash rather than a zero that looks
 * like an amount.
 *
 * @param props - Component props.
 * @returns The signed amount.
 */
export function EntryChange({
  entry,
  fallbackCurrency,
}: {
  /** The statement line. */
  entry: FriendLedgerEntry;
  /** Currency for a line from before lines carried their own. */
  fallbackCurrency: string;
}) {
  if (entry.deleted) return <span className="font-semibold text-ink-soft">—</span>;
  return (
    <span
      className={`font-semibold tabular-nums ${
        entry.deltaCents > 0 ? "text-pos-700" : "text-neg-600"
      }`}
    >
      {entry.deltaCents > 0 ? "+" : "−"}
      {formatMoney(Math.abs(entry.deltaCents), entry.currency || fallbackCurrency)}
    </span>
  );
}

/** Entry balance: where the two people stood after one statement line. */

import type { FriendLedgerEntry } from "@haalkhata/protogen/expense/v1/expense_pb";
import { formatMoney } from "@haalkhata/shared/money/money";

/**
 * Renders the running balance after a line, and which way it leans. The
 * balance runs per currency: a euro line continues the euro balance, not the
 * dollar one.
 *
 * @param props - Component props.
 * @returns The amount and its direction.
 */
export function EntryBalance({
  entry,
  fallbackCurrency,
}: {
  /** The statement line. */
  entry: FriendLedgerEntry;
  /** Currency for a line from before lines carried their own. */
  fallbackCurrency: string;
}) {
  return (
    <span className="tabular-nums">
      {formatMoney(Math.abs(entry.balanceAfterCents), entry.currency || fallbackCurrency)}
      <span className="ml-1 text-[11px] text-ink-soft">
        {entry.balanceAfterCents === 0
          ? "even"
          : entry.balanceAfterCents > 0
            ? "to you"
            : "to them"}
      </span>
    </span>
  );
}

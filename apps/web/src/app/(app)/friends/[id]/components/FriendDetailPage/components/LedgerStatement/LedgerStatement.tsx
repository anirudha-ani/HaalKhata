"use client";
/** Ledger statement: the shared history with one person — a table where there is room for one, a block per line where there is not. */

import type { FriendLedgerEntry } from "@haalkhata/protogen/expense/v1/expense_pb";
import { netSettlementTag } from "@haalkhata/shared/expense/netSettlementLines";
import { formatMoney } from "@haalkhata/shared/money/money";
import { localDate } from "@haalkhata/shared/time/localTime";
import type { SettlementRemovalError } from "../../hooks/useFriendLedger";
import { EntryBalance } from "./components/EntryBalance/EntryBalance";
import { EntryChange } from "./components/EntryChange/EntryChange";
import { EntryDetail } from "./components/EntryDetail/EntryDetail";

/**
 * Renders every expense and payment between two people, what each did to the
 * balance, and the balance after it.
 *
 * Five columns do not fit a phone, nor the narrow column left beside the
 * sidebar on a tablet, and a table that scrolls sideways hides exactly the
 * parts that say what a line was: its tags, its Remove, its figures. So
 * below the `lg` breakpoint each line is a block instead — name and movement
 * on top, date and running balance beneath. From `lg` up it is a table whose
 * "What" column wraps, so the figures stay in view there too.
 *
 * The lines of one net settlement are marked down their left edge: the
 * payment and the balances it cancelled were recorded together and are
 * removed together, and the mark shows which lines those are.
 *
 * @param props - Component props.
 * @returns The statement.
 */
export function LedgerStatement({
  entries,
  currency,
  confirmingSettlementId,
  removingSettlementId,
  removalError,
  onRemoveSettlement,
}: {
  /** The statement's lines, newest first. */
  entries: FriendLedgerEntry[];
  /** Currency for a line from before lines carried their own. */
  currency: string;
  /** The payment whose Remove has been tapped once, or "". */
  confirmingSettlementId: string;
  /** The payment being removed right now, if any. */
  removingSettlementId: string | undefined;
  /** The last refused removal, if any. */
  removalError: SettlementRemovalError | null;
  /** Called on each tap of a payment's Remove. */
  onRemoveSettlement: (settlementId: string) => void;
}) {
  const lines = entries.map((entry) => ({
    entry,
    lineKey: `${entry.kind}-${entry.id}`,
    // A settlement is a moment, shown in the viewer's own timezone; an
    // expense's date is the calendar day the user picked, which has no
    // timezone to convert.
    date: entry.createdAt ? localDate(entry.createdAt) : entry.date,
    edge: entry.netSettlementId ? "border-l-brand-200" : "border-l-transparent",
    detail: (
      <EntryDetail
        entry={entry}
        netTag={netSettlementTag(entry, entries)}
        isConfirming={confirmingSettlementId === entry.id}
        isRemoving={removingSettlementId === entry.id}
        removalError={removalError?.settlementId === entry.id ? removalError.message : ""}
        onRemove={() => onRemoveSettlement(entry.id)}
      />
    ),
  }));

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <ul className="divide-y divide-line/60 lg:hidden">
        {lines.map(({ entry, lineKey, date, edge, detail }) => (
          <li key={lineKey} className={`space-y-1.5 border-l-[3px] py-3 pr-4 pl-[13px] ${edge}`}>
            <div className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">{detail}</div>
              <span className="shrink-0">
                <EntryChange entry={entry} fallbackCurrency={currency} />
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-xs text-ink-soft">
              <span className="tabular-nums">
                {date}
                {/* A payment's total is its movement, already shown above. */}
                {entry.kind === "expense"
                  ? ` · total ${formatMoney(entry.totalCents, entry.currency || currency)}`
                  : ""}
              </span>
              <span className="shrink-0">
                Balance{" "}
                <span className="text-ink">
                  <EntryBalance entry={entry} fallbackCurrency={currency} />
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-soft">
              <th className="py-2 pl-4 text-left font-medium">Date</th>
              <th className="w-full py-2 pl-3 text-left font-medium">What</th>
              <th className="py-2 pl-3 text-right font-medium">Total</th>
              <th className="py-2 pl-3 text-right font-medium">Change</th>
              <th className="py-2 pr-4 pl-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ entry, lineKey, date, edge, detail }) => (
              <tr key={lineKey} className="border-b border-line/60">
                <td
                  className={`border-l-[3px] py-2.5 pl-[13px] align-baseline text-xs whitespace-nowrap text-ink-soft tabular-nums ${edge}`}
                >
                  {date}
                </td>
                <td className="py-2.5 pl-3 align-baseline">{detail}</td>
                <td className="py-2.5 pl-3 text-right align-baseline whitespace-nowrap text-ink-soft tabular-nums">
                  {formatMoney(entry.totalCents, entry.currency || currency)}
                </td>
                <td className="py-2.5 pl-3 text-right align-baseline whitespace-nowrap">
                  <EntryChange entry={entry} fallbackCurrency={currency} />
                </td>
                <td className="py-2.5 pr-4 pl-3 text-right align-baseline whitespace-nowrap">
                  <EntryBalance entry={entry} fallbackCurrency={currency} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

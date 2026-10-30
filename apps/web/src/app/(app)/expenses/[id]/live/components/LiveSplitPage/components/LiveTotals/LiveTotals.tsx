"use client";
/** What the bill comes to for this person, and the way to pay it. */

import { unclaimedStaysWith } from "@haalkhata/shared/expense/live/live.constants";
import { liveTotal } from "@haalkhata/shared/expense/live/liveEdits";
import { Money } from "@/components/ui/Money/Money";
import type { LiveSplitController } from "../../hooks/useLiveSplit";

/**
 * Says what this person owes, with Settle beside it, and what nobody has
 * claimed yet. Whoever paid sees everybody else's shares instead, and somebody
 * who has paid up sees that it is done.
 *
 * @param props - The page's controller.
 * @returns The panel.
 */
export function LiveTotals({ live }: { live: LiveSplitController }) {
  const { summary, expense, state } = live;
  if (!summary || !expense || !state) return null;
  const payer = live.people.get(summary.payerId);
  const payerName = summary.payerId === live.meId ? "you" : (payer?.name.split(" ")[0] ?? "whoever paid");
  const total = liveTotal(state, live.meId, live.isSettled);

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-soft">{total.label}</p>
          <Money
            cents={total.cents}
            currency={expense.currency}
            className={`text-2xl font-bold ${total.owing ? "text-neg-600" : "text-pos-700"}`}
          />
        </div>
        {total.owing && payer && total.cents > 0 ? (
          <button
            type="button"
            onClick={live.openSettle}
            className="rounded-xl bg-pos-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pos-700"
          >
            Settle
          </button>
        ) : null}
      </div>
      {summary.unclaimedLines > 0 ? (
        <p className="text-sm text-ink-soft">
          <Money cents={summary.unclaimedCents} currency={expense.currency} className="font-semibold" /> not claimed yet.{" "}
          {unclaimedStaysWith(payerName)}
        </p>
      ) : null}
    </section>
  );
}

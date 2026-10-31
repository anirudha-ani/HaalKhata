"use client";
/** Who paid the bill, and the way for anyone else who paid to say so. */

import { useState } from "react";
import { livePayers } from "@haalkhata/shared/expense/live/liveEdits";
import type { LiveSplitController } from "../../hooks/useLiveSplit";
import { PaidAmountForm } from "./components/PaidAmountForm/PaidAmountForm";
import { PayerRow } from "./components/PayerRow/PayerRow";

/**
 * Lists who paid. Anybody here can add themselves or somebody else, say for a
 * second card: tapping a name asks how much, and the others who paid make up
 * the rest.
 *
 * @param props - The page's controller.
 * @returns The panel.
 */
export function LivePayers({ live }: { live: LiveSplitController }) {
  const [adding, setAdding] = useState("");
  if (!live.state) return null;
  const payers = livePayers(live.state, live.meId);
  const others = live.castIds
    .filter((userId) => !(userId in (live.state?.payers ?? {})))
    .sort((first, second) => Number(second === live.meId) - Number(first === live.meId));

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-sm text-ink-soft">Paid by</h2>
      <ul className="mt-1 divide-y divide-line">
        {payers.map((payer) => (
          <PayerRow key={payer.userId} live={live} payer={payer} payerCount={payers.length} />
        ))}
      </ul>
      {live.isOpen && others.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-soft">Also paid:</span>
          {others.map((userId) => (
            <button
              key={userId}
              type="button"
              aria-pressed={adding === userId}
              onClick={() => setAdding(adding === userId ? "" : userId)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                adding === userId ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-card text-ink-soft hover:border-brand-200"
              }`}
            >
              {live.nameOf(userId)}
            </button>
          ))}
        </div>
      ) : null}
      {adding !== "" && others.includes(adding) ? (
        <PaidAmountForm
          key={adding}
          canRemove={false}
          live={live}
          name={live.nameOf(adding)}
          onDone={() => setAdding("")}
          paidCents={0}
          userId={adding}
        />
      ) : null}
    </section>
  );
}

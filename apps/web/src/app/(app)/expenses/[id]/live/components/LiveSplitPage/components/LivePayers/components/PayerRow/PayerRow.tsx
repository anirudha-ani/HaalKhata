"use client";
/** One person who paid: how much, and the way to settle with them. */

import { useState } from "react";
import { Pencil } from "lucide-react";
import { whatPaid } from "@haalkhata/shared/expense/live/live.constants";
import type { LivePayer } from "@haalkhata/shared/expense/live/liveEdits";
import { Money } from "@/components/ui/Money/Money";
import type { LiveSplitController } from "../../../../hooks/useLiveSplit";
import { PaidAmountForm } from "../PaidAmountForm/PaidAmountForm";

/**
 * Shows what somebody paid. Settle sits beside whoever this person owes for
 * the bill; it is there for now or for later, and nothing waits on it.
 *
 * @param props - The payer, how many people paid, and the page's controller.
 * @returns The list item.
 */
export function PayerRow({ payer, payerCount, live }: { payer: LivePayer; payerCount: number; live: LiveSplitController }) {
  const [editing, setEditing] = useState(false);
  const name = live.nameOf(payer.userId);
  const canSettle =
    payer.owedCents > 0 && live.standing.owedUserIds.includes(payer.userId) && live.people.has(payer.userId);
  // One payer covers the whole bill, so there is no figure to change.
  const canChange = live.isOpen && payerCount > 1;

  return (
    <li>
      <div className="flex items-center gap-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        <Money cents={payer.paidCents} currency={live.expense?.currency ?? "USD"} className="text-sm font-semibold" />
        {canChange ? (
          <button
            type="button"
            aria-label={`Change ${whatPaid(name)}`}
            onClick={() => setEditing(true)}
            className="rounded-lg p-1.5 text-ink-soft hover:bg-paper"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null}
        {canSettle ? (
          <button
            type="button"
            aria-label={`Settle with ${name}`}
            onClick={() => live.openSettle(payer.userId)}
            className="rounded-lg bg-pos-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-pos-700"
          >
            Settle
          </button>
        ) : null}
      </div>
      {editing ? (
        <PaidAmountForm
          canRemove={payerCount > 1}
          live={live}
          name={name}
          onDone={() => setEditing(false)}
          paidCents={payer.paidCents}
          userId={payer.userId}
        />
      ) : null}
    </li>
  );
}

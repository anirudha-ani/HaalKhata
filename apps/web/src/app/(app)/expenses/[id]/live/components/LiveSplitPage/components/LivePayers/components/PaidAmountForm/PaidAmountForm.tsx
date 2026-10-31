"use client";
/** Says how much somebody paid towards the bill. */

import { useState } from "react";
import { LIVE_PAID_HINT, whatPaid } from "@haalkhata/shared/expense/live/live.constants";
import { checkPaidAmount, setPaid } from "@haalkhata/shared/expense/live/liveEdits";
import { centsToInput } from "@haalkhata/shared/money/money";
import type { LiveSplitController } from "../../../../hooks/useLiveSplit";

/**
 * An amount, a save and a way out. Whatever is left of the bill goes to the
 * others who paid, so it always adds up.
 *
 * @param props - Who paid, what they have down so far, whether they can come
 *   off the bill's payers, what to do when finished, and the page's controller.
 * @returns The form.
 */
export function PaidAmountForm({
  userId,
  name,
  paidCents,
  canRemove,
  onDone,
  live,
}: {
  /** Who paid. */
  userId: string;
  /** What to call them. */
  name: string;
  /** What they have down so far; 0 when they are being added. */
  paidCents: number;
  /** Whether they can stop being a payer: somebody else paid too. */
  canRemove: boolean;
  /** Closes the form. */
  onDone: () => void;
  /** The page's controller. */
  live: LiveSplitController;
}) {
  const currency = live.expense?.currency ?? "USD";
  const [amount, setAmount] = useState(paidCents > 0 ? centsToInput(paidCents, currency) : "");
  if (!live.state) return null;
  const check = checkPaidAmount(amount, live.state, currency);

  /**
   * Saves a figure and closes the form.
   *
   * @param cents - What they paid; 0 takes them off.
   */
  const save = (cents: number) => {
    live.apply(setPaid(userId, cents));
    onDone();
  };

  return (
    <form
      className="space-y-1.5 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (check.cents > 0) save(check.cents);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-invalid={check.message !== ""}
          aria-label={`Enter ${whatPaid(name)}`}
          autoComplete="off"
          className="w-28 rounded-lg border border-line bg-paper px-3 py-2 text-right text-sm"
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          value={amount}
        />
        <button
          type="submit"
          disabled={check.cents <= 0}
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft"
        >
          Cancel
        </button>
        {canRemove ? (
          <button
            type="button"
            onClick={() => save(0)}
            className="rounded-lg px-2 py-2 text-sm font-semibold text-neg-600"
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className={`text-xs ${check.message ? "text-neg-600" : "text-ink-soft"}`}>{check.message || LIVE_PAID_HINT}</p>
    </form>
  );
}

"use client";
/** The bill's tax and tip, shared in proportion to what people claimed. */

import { useState } from "react";
import { setTaxAndTip } from "@haalkhata/shared/expense/live/liveEdits";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import type { LiveSplitController } from "../../hooks/useLiveSplit";

/**
 * Two amounts, saved when the person leaves the field. Each field holds what
 * is being typed; between edits it shows what is saved, so a change from
 * somebody else appears here too.
 *
 * @param props - The page's controller.
 * @returns The fields.
 */
export function LiveExtras({ live }: { live: LiveSplitController }) {
  const currency = live.expense?.currency ?? "USD";
  const state = live.state;
  const [typing, setTyping] = useState<{ part: "tax" | "tip"; value: string } | null>(null);
  if (!state) return null;

  /**
   * What a field shows.
   *
   * @param part - Which field.
   * @param cents - What is saved.
   * @returns The text.
   */
  const shown = (part: "tax" | "tip", cents: number) =>
    typing?.part === part ? typing.value : cents > 0 ? centsToInput(cents, currency) : "";

  /** Saves the field being left, if it changed. */
  const leave = () => {
    if (!typing) return;
    const cents = parseMoneyInput(typing.value, currency) ?? 0;
    const taxCents = typing.part === "tax" ? cents : state.taxCents;
    const tipCents = typing.part === "tip" ? cents : state.tipCents;
    setTyping(null);
    if (taxCents !== state.taxCents || tipCents !== state.tipCents) live.apply(setTaxAndTip({ taxCents, tipCents }));
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {(
        [
          ["tax", "Tax", state.taxCents],
          ["tip", "Tip", state.tipCents],
        ] as const
      ).map(([part, label, cents]) => (
        <label key={part} className="space-y-1 text-xs font-semibold text-ink-soft">
          {label}
          <input
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-right text-sm font-normal text-ink"
            disabled={!live.isOpen}
            inputMode="decimal"
            onBlur={leave}
            onChange={(event) => setTyping({ part, value: event.target.value })}
            placeholder="0.00"
            value={shown(part, cents)}
          />
        </label>
      ))}
    </div>
  );
}

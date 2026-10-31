"use client";
/** Adds a line the receipt missed. */

import { useState } from "react";
import { Plus } from "lucide-react";
import { addLine } from "@haalkhata/shared/expense/live/liveEdits";
import { parseMoneyInput } from "@haalkhata/shared/money/money";
import { MAX_EXPENSE_ITEM_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import type { LiveSplitController } from "../../hooks/useLiveSplit";

/**
 * A name, a price and a button; the new line opens with nobody on it.
 *
 * @param props - The page's controller.
 * @returns The form.
 */
export function AddLineForm({ live }: { live: LiveSplitController }) {
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const totalCents = parseMoneyInput(total, live.expense?.currency ?? "USD") ?? 0;
  const canAdd = name.trim() !== "" && totalCents > 0;

  /** Adds the line and clears the form for the next one. */
  const submit = () => {
    if (!canAdd) return;
    live.apply(addLine({ name: name.trim(), totalCents }));
    setName("");
    setTotal("");
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        aria-label="New line"
        className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm"
        maxLength={MAX_EXPENSE_ITEM_NAME_LENGTH}
        onChange={(event) => setName(event.target.value)}
        placeholder="Add something the receipt missed"
        value={name}
      />
      <input
        aria-label="Price of the new line"
        className="w-24 rounded-lg border border-line bg-paper px-3 py-2 text-right text-sm"
        inputMode="decimal"
        onChange={(event) => setTotal(event.target.value)}
        placeholder="0.00"
        value={total}
      />
      <button
        type="submit"
        disabled={!canAdd}
        aria-label="Add line"
        className="rounded-lg bg-brand-600 p-2 text-white hover:bg-brand-700 disabled:opacity-40"
      >
        <Plus className="h-5 w-5" />
      </button>
    </form>
  );
}

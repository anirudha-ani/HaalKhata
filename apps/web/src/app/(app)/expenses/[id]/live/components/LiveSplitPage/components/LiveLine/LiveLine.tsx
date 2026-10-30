"use client";
/** One line of the bill: what it was, who had it, and for those who can still change it, how. */

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { lineShareCents, removeLine, setLineDetails, setOnLine } from "@haalkhata/shared/expense/live/liveEdits";
import type { LineState } from "@haalkhata/shared/expense/merge/expenseState";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MAX_EXPENSE_ITEM_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { Money } from "@/components/ui/Money/Money";
import type { LiveSplitController } from "../../hooks/useLiveSplit";

/**
 * Shows a line with a chip per person, tapping one puts them on it or takes
 * them off. Anybody at the table can do that for anybody, the way a bill is
 * sorted out out loud. Correcting the line opens in place.
 *
 * @param props - The line and the page's controller.
 * @returns The list item.
 */
export function LiveLine({ line, live }: { line: LineState; live: LiveSplitController }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(line.name);
  const [total, setTotal] = useState("");
  const currency = live.expense?.currency ?? "USD";
  const myShare = lineShareCents(line, live.meId);
  const unclaimed = Object.keys(line.shares).length === 0;
  const parsedTotal = parseMoneyInput(total, currency) ?? 0;
  const canSave = name.trim() !== "" && parsedTotal > 0;

  /** Opens the correction with the line as it is now. */
  const startEditing = () => {
    setName(line.name);
    setTotal(centsToInput(line.totalCents, currency));
    setEditing(true);
  };

  return (
    <li className="space-y-2 py-3">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label={`Name of ${line.name}`}
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm"
            maxLength={MAX_EXPENSE_ITEM_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <input
            aria-label={`Price of ${line.name}`}
            className="w-24 rounded-lg border border-line bg-paper px-3 py-2 text-right text-sm"
            inputMode="decimal"
            onChange={(event) => setTotal(event.target.value)}
            value={total}
          />
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              live.apply(setLineDetails(line.id, { name: name.trim(), totalCents: parsedTotal }));
              setEditing(false);
            }}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {line.quantity > 1 ? `${line.quantity}× ` : ""}
            {line.name}
          </span>
          <Money cents={line.totalCents} currency={currency} className="text-sm font-semibold" />
          {live.isOpen && line.id !== "" ? (
            <>
              <button
                type="button"
                aria-label={`Change ${line.name}`}
                onClick={startEditing}
                className="rounded-lg p-1.5 text-ink-soft hover:bg-paper"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${line.name}`}
                disabled={(live.state?.lines.length ?? 0) < 2}
                onClick={() => live.apply(removeLine(line.id))}
                className="rounded-lg p-1.5 text-ink-soft hover:bg-paper disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {live.castIds.map((userId) => {
          const isOn = (line.shares[userId] ?? 0) > 0;
          const person = userId === live.meId ? "You" : (live.people.get(userId)?.name.split(" ")[0] ?? "Someone");
          return (
            <button
              key={userId}
              type="button"
              aria-pressed={isOn}
              disabled={!live.isOpen || line.id === ""}
              onClick={() => live.apply(setOnLine(line.id, userId, !isOn))}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
                isOn ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-card text-ink-soft hover:border-brand-200"
              }`}
            >
              {person}
            </button>
          );
        })}
        {unclaimed ? <span className="text-xs text-ink-soft">Not claimed yet</span> : null}
        {myShare !== null ? (
          <span className="ml-auto text-xs text-ink-soft">
            your part <Money cents={myShare} currency={currency} />
          </span>
        ) : null}
      </div>
    </li>
  );
}

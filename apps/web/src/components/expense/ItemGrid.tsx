"use client";
/** Items × people grid: one row per line item, one column per person, live totals. */

import { Check, Plus, X } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import { percentOfItems } from "@/lib/expense/splitForm";
import { Avatar } from "@/components/ui/Avatar";
import { MAX_ASSIGNEE_WEIGHT, TIP_PERCENT_PRESETS } from "./itemGrid.constants";

/** One editable line item, however the owning form stores the rest of its draft. */
export interface GridItem {
  /** Stable client-side key (items have no server id until saved). */
  key: string;
  /** Item name. */
  name: string;
  /** Raw money input for the line total, e.g. "14.50". */
  total: string;
  /** How many were bought; only rendered when the grid shows the quantity column. */
  quantity?: number;
  /** Share weight per user id; absent or 0 means "not on this item". */
  assignees: Record<string, number>;
}

/** Shared input styling for the grid's editable cells. */
const cellClass =
  "rounded-lg border border-line bg-paper px-2.5 py-1.5 focus:border-brand-500 focus:outline-none";

/**
 * Parses a share-weight cell into the weight to store. Blank, zero, or
 * unparseable input means "not on this item"; anything else is clamped to a
 * sane positive integer.
 *
 * @param value - The raw text typed into a share cell.
 * @returns The weight to store, where 0 removes the person from the item.
 */
function parseWeightCell(value: string): number {
  const parsed = parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, MAX_ASSIGNEE_WEIGHT);
}

/**
 * Renders line items as a grid: one row per item, one column per person, and a
 * live per-person total along the bottom. Tax and tip are rows in the same
 * grid so the whole bill reconciles in one table.
 *
 * A cell is a toggle — tap to take somebody off an item or put them back on —
 * because the binding constraint on a 20-line receipt is cognitive load, not
 * expressiveness. `unevenShares` swaps the cells for number inputs when one
 * person had two of something and another had one.
 *
 * Shared by the expense form's Itemized tab and the receipt scanner so both
 * behave identically; each owns its own draft state and passes it in.
 *
 * @param props - Component props.
 * @returns The grid.
 */
export function ItemGrid({
  items,
  people,
  currentUserId,
  currency,
  unevenShares,
  showQuantity = false,
  taxInput,
  tipInput,
  itemsTotalCents,
  totalCents,
  shares,
  onUpdateItem,
  onSetWeight,
  onRemoveItem,
  onAddItem,
  onTaxChange,
  onTipChange,
  onApplyTipPercent,
}: {
  /** The line items to render, in order. */
  items: GridItem[];
  /** Everyone who can be on an item; becomes one column each. */
  people: User[];
  /** Id of the signed-in user, whose column is labelled "You". */
  currentUserId: string;
  /** ISO 4217 code used to format the totals row. */
  currency: string;
  /** Whether cells are weight inputs rather than on/off toggles. */
  unevenShares: boolean;
  /** Whether to show the leading quantity column (the scanner reads it off the receipt). */
  showQuantity?: boolean;
  /** Raw tax money input. */
  taxInput: string;
  /** Raw tip money input. */
  tipInput: string;
  /** The items subtotal in cents — the base the tax/tip percentages read against. */
  itemsTotalCents: number;
  /** Items + tax + tip, in cents, for the totals row. */
  totalCents: number;
  /** What each person currently owes, keyed by user id, in cents. */
  shares: Record<string, number>;
  /** Applies a partial update to the item at `index`. */
  onUpdateItem: (index: number, patch: Partial<GridItem>) => void;
  /** Sets one person's share weight on the item at `index`; 0 removes them. */
  onSetWeight: (index: number, userId: string, weight: number) => void;
  /** Removes the item at `index`. */
  onRemoveItem: (index: number) => void;
  /** Appends a blank item row. */
  onAddItem: () => void;
  /** Called with the raw tax input on every keystroke. */
  onTaxChange: (value: string) => void;
  /** Called with the raw tip input on every keystroke. */
  onTipChange: (value: string) => void;
  /** Sets the tip to a percentage of the items subtotal. */
  onApplyTipPercent: (percent: number) => void;
}) {
  const leadingColumns = showQuantity ? 3 : 2;
  const columnCount = leadingColumns + people.length + 1;
  // What each add-on works out to as a rate. A bare "8.40" says nothing about
  // whether it is the tax you expected; "8.9% of items" does.
  const taxPercent = percentOfItems(parseMoneyInput(taxInput) ?? 0, itemsTotalCents);
  const tipPercent = percentOfItems(parseMoneyInput(tipInput) ?? 0, itemsTotalCents);

  return (
    // People columns can outgrow the viewport; the grid scrolls, the page does not.
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          {/* Header padding matches each input's own text inset (cell 6px +
              border 1px + input 10px ≈ 17px) so labels sit over their values. */}
          <tr className="border-b border-line text-xs text-ink-soft">
            {showQuantity ? <th className="py-2 pl-4 text-left font-medium">Qty</th> : null}
            <th className={`py-2 text-left font-medium ${showQuantity ? "pl-1.5" : "pl-4"}`}>
              Item
            </th>
            <th className="py-2 pr-4 text-right font-medium">Amount</th>
            {people.map((person) => (
              <th key={person.id} className="px-1.5 py-1.5 font-medium">
                <span className="flex flex-col items-center gap-0.5">
                  <Avatar user={person} size="xsmall" />
                  <span className="max-w-14 truncate text-[11px]">
                    {person.id === currentUserId ? "You" : person.name.split(/\s+/)[0]}
                  </span>
                </span>
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>

        <tbody>
          {items.map((item, index) => {
            const isUnassigned = !Object.values(item.assignees).some((weight) => weight > 0);
            return (
              <tr
                key={item.key}
                className={`border-b border-line/60 ${isUnassigned ? "bg-neg-50/40" : ""}`}
              >
                {showQuantity ? (
                  <td className="py-1.5 pl-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Quantity for item ${index + 1}`}
                      value={item.quantity ?? 1}
                      onChange={(event) =>
                        onUpdateItem(index, {
                          quantity: Math.max(1, parseInt(event.target.value, 10) || 1),
                        })
                      }
                      className={`${cellClass} w-12 text-center tabular-nums`}
                    />
                  </td>
                ) : null}
                <td className="px-1.5 py-1.5">
                  <input
                    type="text"
                    placeholder="Item name"
                    aria-label={`Name for item ${index + 1}`}
                    value={item.name}
                    onChange={(event) => onUpdateItem(index, { name: event.target.value })}
                    className={`${cellClass} w-full min-w-36`}
                  />
                </td>
                <td className="px-1.5 py-1.5 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Amount for item ${index + 1}`}
                    value={item.total}
                    onChange={(event) => onUpdateItem(index, { total: event.target.value })}
                    className={`${cellClass} w-20 text-right tabular-nums`}
                  />
                </td>
                {people.map((person) => {
                  const weight = item.assignees[person.id] ?? 0;
                  const isOnItem = weight > 0;
                  const label = person.id === currentUserId ? "You" : person.name;
                  return (
                    <td key={person.id} className="px-1.5 py-1.5 text-center">
                      {unevenShares ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="–"
                          aria-label={`${label}'s share of item ${index + 1}`}
                          value={isOnItem ? String(weight) : ""}
                          onChange={(event) =>
                            onSetWeight(index, person.id, parseWeightCell(event.target.value))
                          }
                          className={`w-14 rounded-lg border py-1.5 text-center tabular-nums focus:outline-none ${
                            isOnItem
                              ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                              : "border-line bg-paper text-ink-soft placeholder:text-line"
                          }`}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSetWeight(index, person.id, isOnItem ? 0 : 1)}
                          aria-pressed={isOnItem}
                          aria-label={`${isOnItem ? "Remove" : "Add"} ${label} ${
                            isOnItem ? "from" : "to"
                          } item ${index + 1}`}
                          className={`inline-flex h-8 w-14 items-center justify-center rounded-lg border transition-colors ${
                            isOnItem
                              ? "border-brand-500 bg-brand-50 text-brand-700"
                              : "border-line bg-paper text-line hover:border-brand-300"
                          }`}
                        >
                          {isOnItem ? <Check className="h-4 w-4" /> : null}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="px-1 py-1.5">
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    aria-label={`Remove item ${index + 1}`}
                    className="rounded-md p-1 text-ink-soft hover:text-neg-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}

          <tr className="border-b border-line">
            <td className="px-1.5 py-1.5" colSpan={columnCount}>
              <button
                type="button"
                onClick={onAddItem}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-1.5 text-sm font-medium text-ink-soft hover:border-brand-500 hover:text-brand-700"
              >
                <Plus className="h-4 w-4" /> Add item
              </button>
            </td>
          </tr>

          <tr className="border-b border-line/60">
            <td className="py-1.5 pl-4 text-ink-soft" colSpan={leadingColumns - 1}>
              Tax
            </td>
            <td className="px-1.5 py-1.5 text-right">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Tax"
                value={taxInput}
                onChange={(event) => onTaxChange(event.target.value)}
                className={`${cellClass} w-20 text-right tabular-nums`}
              />
            </td>
            <td className="pl-3 text-xs text-ink-soft" colSpan={columnCount - leadingColumns}>
              {taxPercent ? (
                <span className="mr-1.5 font-semibold text-ink tabular-nums">
                  {taxPercent} of items
                </span>
              ) : null}
              split in proportion to each person&apos;s items
            </td>
          </tr>

          <tr className="border-b border-line">
            <td className="py-1.5 pl-4 text-ink-soft" colSpan={leadingColumns - 1}>
              Tip
            </td>
            <td className="px-1.5 py-1.5 text-right">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Tip"
                value={tipInput}
                onChange={(event) => onTipChange(event.target.value)}
                className={`${cellClass} w-20 text-right tabular-nums`}
              />
            </td>
            <td className="pl-3" colSpan={columnCount - leadingColumns}>
              <span className="flex flex-wrap items-center gap-1.5">
                {TIP_PERCENT_PRESETS.map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    onClick={() => onApplyTipPercent(percent)}
                    className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft hover:border-brand-500 hover:text-brand-700"
                  >
                    {percent}%
                  </button>
                ))}
                {tipPercent ? (
                  <span className="text-xs font-semibold text-ink tabular-nums">
                    {tipPercent} of items
                  </span>
                ) : null}
              </span>
            </td>
          </tr>

          <tr className="bg-paper/60 font-semibold">
            <td className="py-2 pl-4" colSpan={leadingColumns - 1}>
              Total
            </td>
            <td className="py-2 pr-4 text-right tabular-nums">
              {formatMoney(totalCents, currency)}
            </td>
            {people.map((person) => (
              <td
                key={person.id}
                className="px-1.5 py-2 text-center text-xs tabular-nums text-brand-700"
              >
                {shares[person.id] ? formatMoney(shares[person.id], currency) : "—"}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

"use client";
/** Itemized split editor: a grid of items × people, with live per-person totals. */

import { Check, Plus, X } from "lucide-react";
import { formatMoney } from "@haalkhata/shared/money/money";
import { Avatar } from "@/components/ui/Avatar";
import { MAX_ASSIGNEE_WEIGHT, TIP_PERCENT_PRESETS } from "../../../../constants/splitEditor";
import type { NewExpenseController } from "../../hooks/useNewExpense";

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
 * Renders the itemized split editor as a grid: one row per line item, one
 * column per person, and a live total per person along the bottom.
 *
 * New items arrive already shared by everyone, so the common case costs zero
 * taps — you only touch the exceptions. A cell is a toggle: tap to take
 * somebody off an item or put them back on. Switching on "uneven shares"
 * turns the cells into number inputs for the rarer case where one person had
 * two of something and another had one.
 *
 * The totals row runs the same allocator the server uses, so what it shows is
 * what gets saved.
 *
 * @param props - Component props.
 * @returns The itemized editor section.
 */
export function ItemizedEditor({
  form,
  currency,
}: {
  /** The expense-form controller from useNewExpense that owns the item draft. */
  form: NewExpenseController;
  /** ISO 4217 currency code used to format the running totals. */
  currency: string;
}) {
  const columnCount = 2 + form.people.length + 1;

  return (
    <div className="space-y-2">
      {/* People columns can outgrow the viewport; the grid scrolls, the page does not. */}
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            {/* Header padding matches each input's own text inset (cell 6px +
                border 1px + input 10px ≈ 17px) so labels sit over their values. */}
            <tr className="border-b border-line text-xs text-ink-soft">
              <th className="py-2 pl-4 text-left font-medium">Item</th>
              <th className="py-2 pr-4 text-right font-medium">Amount</th>
              {form.people.map((person) => (
                <th key={person.id} className="px-1.5 py-1.5 font-medium">
                  <span className="flex flex-col items-center gap-0.5">
                    <Avatar user={person} size="xsmall" />
                    <span className="max-w-14 truncate text-[11px]">
                      {person.id === form.me?.id ? "You" : person.name.split(/\s+/)[0]}
                    </span>
                  </span>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>

          <tbody>
            {form.items.map((item, index) => (
              <tr key={item.key} className="border-b border-line/60">
                <td className="px-1.5 py-1.5">
                  <input
                    type="text"
                    placeholder="Item name"
                    aria-label={`Name for item ${index + 1}`}
                    value={item.name}
                    onChange={(event) => form.updateItem(index, { name: event.target.value })}
                    className="w-full min-w-36 rounded-lg border border-line bg-paper px-2.5 py-1.5 focus:border-brand-500 focus:outline-none"
                  />
                </td>
                <td className="px-1.5 py-1.5 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Amount for item ${index + 1}`}
                    value={item.total}
                    onChange={(event) => form.updateItem(index, { total: event.target.value })}
                    className="w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-right tabular-nums focus:border-brand-500 focus:outline-none"
                  />
                </td>
                {form.people.map((person) => {
                  const weight = item.assignees[person.id] ?? 0;
                  const isOnItem = weight > 0;
                  const label = person.id === form.me?.id ? "You" : person.name;
                  return (
                    <td key={person.id} className="px-1.5 py-1.5 text-center">
                      {form.unevenShares ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="–"
                          aria-label={`${label}'s share of item ${index + 1}`}
                          value={isOnItem ? String(weight) : ""}
                          onChange={(event) =>
                            form.setAssigneeWeight(
                              index,
                              person.id,
                              parseWeightCell(event.target.value),
                            )
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
                          onClick={() => form.setAssigneeWeight(index, person.id, isOnItem ? 0 : 1)}
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
                    onClick={() => form.removeItem(index)}
                    aria-label={`Remove item ${index + 1}`}
                    className="rounded-md p-1 text-ink-soft hover:text-neg-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}

            <tr className="border-b border-line">
              <td className="px-1.5 py-1.5" colSpan={columnCount}>
                <button
                  type="button"
                  onClick={form.addItem}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-1.5 text-sm font-medium text-ink-soft hover:border-brand-500 hover:text-brand-700"
                >
                  <Plus className="h-4 w-4" /> Add item
                </button>
              </td>
            </tr>

            <tr className="border-b border-line/60">
              <td className="py-1.5 pl-4 text-ink-soft">Tax</td>
              <td className="px-1.5 py-1.5 text-right">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Tax"
                  value={form.taxInput}
                  onChange={(event) => form.setTaxInput(event.target.value)}
                  className="w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-right tabular-nums focus:border-brand-500 focus:outline-none"
                />
              </td>
              <td className="pl-3 text-xs text-ink-soft" colSpan={columnCount - 2}>
                split in proportion to each person&apos;s items
              </td>
            </tr>

            <tr className="border-b border-line">
              <td className="py-1.5 pl-4 text-ink-soft">Tip</td>
              <td className="px-1.5 py-1.5 text-right">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Tip"
                  value={form.tipInput}
                  onChange={(event) => form.setTipInput(event.target.value)}
                  className="w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-right tabular-nums focus:border-brand-500 focus:outline-none"
                />
              </td>
              <td className="pl-3" colSpan={columnCount - 2}>
                <span className="flex items-center gap-1.5">
                  {TIP_PERCENT_PRESETS.map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() => form.applyTipPercent(percent)}
                      className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft hover:border-brand-500 hover:text-brand-700"
                    >
                      {percent}%
                    </button>
                  ))}
                </span>
              </td>
            </tr>

            <tr className="bg-paper/60 font-semibold">
              <td className="py-2 pl-4">Total</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatMoney(form.totalCents ?? 0, currency)}
              </td>
              {form.people.map((person) => (
                <td
                  key={person.id}
                  className="px-1.5 py-2 text-center text-xs tabular-nums text-brand-700"
                >
                  {form.previewShares[person.id]
                    ? formatMoney(form.previewShares[person.id], currency)
                    : "—"}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={form.unevenShares}
          onChange={(event) => form.setUnevenShares(event.target.checked)}
          className="h-4 w-4 accent-brand-600"
        />
        Uneven shares — enter how many portions each person had
      </label>
    </div>
  );
}

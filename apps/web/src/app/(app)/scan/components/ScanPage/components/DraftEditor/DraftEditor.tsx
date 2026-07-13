"use client";
/** Scanned-receipt draft editor: item rows, assignee chips, tax/tip totals, payer picker. */

import { Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { formatMoney } from "@/lib/money/money";
import type { ScanController } from "../../hooks/useScan";

/** Shared input styling for the small editable cells in the draft. */
const cellClass =
  "rounded-lg border border-line bg-paper px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none";

/**
 * Editable AI draft: correct items, then tap avatars to assign them. Renders
 * the merchant/date fields, the item rows with per-person assignee chips,
 * quick assign-all shortcuts, the tax/tip/total summary, and the payer picker.
 *
 * @returns The draft editing form, or null until a receipt has been parsed.
 */
export function DraftEditor({
  scan,
}: {
  /** The scan flow controller returned by useScan, owned by ScanPage. */
  scan: ScanController;
}) {
  if (scan.items === null) return null;
  const currency = scan.selectedGroup?.currency ?? scan.me?.defaultCurrency ?? "USD";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-pos-50 px-3 py-1 text-xs font-semibold text-pos-700">
          ✓ auto-itemized{scan.provider ? ` · ${scan.provider}` : ""}
        </span>
        {scan.provider === "mock" ? (
          <span className="rounded-full bg-neg-50 px-3 py-1 text-xs font-semibold text-neg-700">
            demo data — no AI provider configured
          </span>
        ) : null}
        <span className="text-xs text-ink-soft">review &amp; correct before saving</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          className={`${cellClass} col-span-2 py-2.5 text-base font-medium sm:col-span-1`}
          value={scan.merchant}
          onChange={(event) => scan.setMerchant(event.target.value)}
          placeholder="Merchant"
          aria-label="Merchant"
        />
        <input
          type="date"
          aria-label="Receipt date"
          className={`${cellClass} py-2.5`}
          value={scan.date}
          onChange={(event) => scan.setDate(event.target.value)}
        />
      </div>

      {/* Items */}
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="border-b border-line px-4 py-2.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">
          Tap people to assign each item
        </div>
        <ul className="divide-y divide-line">
          {scan.items.map((item, index) => {
            const assigned = Object.values(item.assignees).some(Boolean);
            return (
              <li key={item.key} className={`space-y-2 p-3 ${assigned ? "" : "bg-neg-50/60"}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(event) =>
                      scan.updateItem(index, { quantity: Math.max(1, Number(event.target.value)) })
                    }
                    className={`${cellClass} w-14 text-center`}
                    aria-label="Quantity"
                  />
                  <input
                    value={item.name}
                    onChange={(event) => scan.updateItem(index, { name: event.target.value })}
                    placeholder="Item"
                    aria-label="Item name"
                    className={`${cellClass} min-w-0 flex-1`}
                  />
                  <input
                    inputMode="decimal"
                    value={item.total}
                    onChange={(event) => scan.updateItem(index, { total: event.target.value })}
                    placeholder="0.00"
                    className={`${cellClass} w-20 text-right tabular-nums`}
                    aria-label="Item total"
                  />
                  <button
                    type="button"
                    onClick={() => scan.removeItem(index)}
                    aria-label="Remove item"
                    className="rounded-lg p-1.5 text-ink-soft hover:text-brand-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-1">
                  {scan.people.map((person) => {
                    const isAssigned = item.assignees[person.id] ?? false;
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => scan.toggleAssignee(index, person.id)}
                        className={`flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs font-medium transition-colors ${
                          isAssigned
                            ? "border-brand-600 bg-brand-50 text-brand-700"
                            : "border-line text-ink-soft opacity-60"
                        }`}
                      >
                        <Avatar user={person} size="sm" />
                        {person.id === scan.me?.id ? "You" : person.name.split(" ")[0]}
                      </button>
                    );
                  })}
                  {!assigned ? (
                    <span className="text-xs font-medium text-neg-600">unassigned</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={scan.addItem}
          className="flex w-full items-center justify-center gap-1.5 border-t border-line py-2.5 text-sm font-medium text-brand-600 hover:bg-paper"
        >
          <Plus className="h-4 w-4" /> Add item
        </button>
      </div>

      {/* Quick assign + totals */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">Assign everything to:</span>
        {scan.people.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => scan.assignAllTo(person.id)}
            className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft hover:border-brand-200 hover:text-brand-600"
          >
            +{person.id === scan.me?.id ? "You" : person.name.split(" ")[0]}
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-2xl border border-line bg-card p-4 text-sm">
        <SummaryRow label="Items">{formatMoney(scan.itemsTotalCents, currency)}</SummaryRow>
        <SummaryRow label="Tax">
          <input
            inputMode="decimal"
            aria-label="Tax"
            value={scan.tax}
            onChange={(event) => scan.setTax(event.target.value)}
            className={`${cellClass} w-24 text-right tabular-nums`}
          />
        </SummaryRow>
        <SummaryRow label="Tip">
          <input
            inputMode="decimal"
            aria-label="Tip"
            value={scan.tip}
            onChange={(event) => scan.setTip(event.target.value)}
            className={`${cellClass} w-24 text-right tabular-nums`}
          />
        </SummaryRow>
        <div className="border-t border-line pt-2">
          <SummaryRow label={<span className="font-semibold text-ink">Total</span>}>
            <span className="text-lg font-bold tabular-nums">
              {formatMoney(scan.grandTotalCents, currency)}
            </span>
          </SummaryRow>
        </div>
        <p className="text-xs text-ink-soft">
          Tax and tip are split in proportion to each person&apos;s items.
        </p>
      </div>

      <label className="block text-sm font-medium text-ink-soft">
        Paid by
        <select
          value={scan.payerId}
          onChange={(event) => scan.setPayerId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2.5 focus:border-brand-500 focus:outline-none"
        >
          {scan.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.id === scan.me?.id ? "You" : person.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * Renders one label/value line in the totals summary card.
 *
 * @returns A flex row with the label on the left and the value on the right.
 */
function SummaryRow({
  label,
  children,
}: {
  /** Left-hand label (plain text or styled node). */
  label: React.ReactNode;
  /** Right-hand value: a formatted amount or an editable input. */
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-soft">{label}</span>
      {children}
    </div>
  );
}

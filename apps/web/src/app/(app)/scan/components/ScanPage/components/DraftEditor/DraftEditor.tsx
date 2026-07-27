"use client";
/** Scanned-receipt draft: merchant/date, the shared items × people grid, and the payer editor. */

import { Avatar } from "@/components/ui/Avatar";
import { ItemGrid } from "@/components/expense/ItemGrid";
import type { ScanController } from "../../hooks/useScan";

/** Shared input styling for the small editable fields in the draft. */
const cellClass =
  "rounded-lg border border-line bg-paper px-2.5 py-2 text-sm focus:border-brand-500 focus:outline-none";

/**
 * Editable AI draft: correct the merchant, date and line items, then tick who
 * had what. Uses the very same {@link ItemGrid} as the expense form's Itemized
 * tab, so a receipt scanned from a photo and a bill split by hand behave
 * identically — including uneven shares, tip presets and live per-person
 * totals from the server's own allocator.
 *
 * @param props - Component props.
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-pos-50 px-3 py-1 text-xs font-semibold text-pos-700">
          ✓ auto-itemized{scan.provider ? ` · ${scan.provider}` : ""}
        </span>
        {scan.provider === "mock" ? (
          <span className="rounded-full bg-neg-50 px-3 py-1 text-xs font-semibold text-neg-700">
            demo data — no AI provider configured
          </span>
        ) : null}
        <span className="text-xs text-ink-soft">check it against the photo before saving</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          className={`${cellClass} col-span-2 text-base font-medium sm:col-span-1`}
          value={scan.merchant}
          onChange={(event) => scan.setMerchant(event.target.value)}
          placeholder="Merchant"
          aria-label="Merchant"
        />
        <input
          type="date"
          aria-label="Receipt date"
          className={cellClass}
          value={scan.date}
          onChange={(event) => scan.setDate(event.target.value)}
        />
      </div>

      <ItemGrid
        showQuantity
        items={scan.items}
        people={scan.people}
        currentUserId={scan.me?.id ?? ""}
        currency={currency}
        unevenShares={scan.unevenShares}
        taxInput={scan.tax}
        tipInput={scan.tip}
        totalCents={scan.totalCents}
        shares={scan.previewShares}
        onUpdateItem={scan.updateItem}
        onSetWeight={scan.setAssigneeWeight}
        onRemoveItem={scan.removeItem}
        onAddItem={scan.addItem}
        onTaxChange={scan.setTax}
        onTipChange={scan.setTip}
        onApplyTipPercent={scan.applyTipPercent}
      />

      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={scan.unevenShares}
          onChange={(event) => scan.setUnevenShares(event.target.checked)}
          className="h-4 w-4 accent-brand-600"
        />
        Uneven shares — enter how many portions each person had
      </label>

      {!scan.splitCheck.ok ? (
        <p className="text-sm font-medium text-neg-600">{scan.splitCheck.message}</p>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">Paid by</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={scan.multiPayer}
              onChange={(event) => scan.setMultiPayer(event.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            multiple people paid
          </label>
        </div>

        {scan.multiPayer ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {scan.people.map((person) => (
              <li key={person.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar user={person} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {person.id === scan.me?.id ? "You" : person.name}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Amount paid by ${person.name}`}
                  value={scan.payerAmounts[person.id] ?? ""}
                  onChange={(event) =>
                    scan.setPayerAmounts({
                      ...scan.payerAmounts,
                      [person.id]: event.target.value,
                    })
                  }
                  className={`${cellClass} w-24 text-right tabular-nums`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <select
            aria-label="Paid by"
            value={scan.singlePayerId}
            onChange={(event) => scan.setSinglePayerId(event.target.value)}
            className="w-full rounded-xl border border-line bg-card px-3 py-2.5 focus:border-brand-500 focus:outline-none"
          >
            {scan.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === scan.me?.id ? "You" : person.name}
              </option>
            ))}
          </select>
        )}

        {!scan.payerCheck.ok ? (
          <p className="text-sm font-medium text-neg-600">{scan.payerCheck.message}</p>
        ) : null}
      </section>
    </div>
  );
}

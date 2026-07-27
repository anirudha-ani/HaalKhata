"use client";
/** Itemized split tab: the shared items × people grid plus the uneven-shares toggle. */

import { ItemGrid } from "@/components/expense/ItemGrid";
import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Renders the Itemized tab: the shared {@link ItemGrid} wired to the expense
 * form's draft, plus the uneven-shares checkbox that turns its cells from
 * on/off toggles into share-weight inputs.
 *
 * The grid is the same component the receipt scanner uses, so a bill split by
 * hand and a bill split from a photo behave identically.
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
  return (
    <div className="space-y-2">
      {/* The quantity column only earns its width when the numbers were read
          off paper; items typed by hand have no quantity to show. */}
      <ItemGrid
        showQuantity={form.fromReceipt}
        items={form.items}
        people={form.people}
        currentUserId={form.me?.id ?? ""}
        currency={currency}
        unevenShares={form.unevenShares}
        taxInput={form.taxInput}
        tipInput={form.tipInput}
        totalCents={form.totalCents ?? 0}
        shares={form.previewShares}
        onUpdateItem={form.updateItem}
        onSetWeight={form.setAssigneeWeight}
        onRemoveItem={form.removeItem}
        onAddItem={form.addItem}
        onTaxChange={form.setTaxInput}
        onTipChange={form.setTipInput}
        onApplyTipPercent={form.applyTipPercent}
      />

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

"use client";
/** Itemized split tab: the shared item cards wired to the expense form's draft. */

import { ItemCards } from "@/components/expense/ItemCards";
import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Renders the Itemized tab: the shared {@link ItemCards} wired to the expense
 * form's draft. Portions are set per card inside the component, so there is
 * no editor-wide switch any more.
 *
 * The same cards serve a bill typed in by hand and one read off a photo; the
 * scanner fills this very draft (§3j), so the two cannot behave differently.
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
    // Quantities only earn a place when the numbers were read off paper;
    // items typed by hand have no quantity to show.
    <ItemCards
      showQuantity={form.fromReceipt}
      items={form.items}
      people={form.people}
      currentUserId={form.me?.id ?? ""}
      currency={currency}
      taxInput={form.taxInput}
      tipInput={form.tipInput}
      itemsTotalCents={form.itemsTotalCents}
      totalCents={form.totalCents ?? 0}
      shares={form.previewShares}
      onUpdateItem={form.updateItem}
      onSetWeight={form.setAssigneeWeight}
      onSetAssignees={form.setItemAssignees}
      onRemoveItem={form.removeItem}
      onAddItem={form.addItem}
      onTaxChange={form.setTaxInput}
      onTipChange={form.setTipInput}
      onApplyTipPercent={form.applyTipPercent}
    />
  );
}

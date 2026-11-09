"use client";
/** The one row of the settle dialog when it pays back a bill: the bill, the balance it counts in, and what is paid. */

import { ReceiptText } from "lucide-react";
import { Money } from "@/components/ui/Money/Money";

/**
 * Renders the bill a pay-back covers, as a row of the same list the dialog
 * shows balances in: its name, the balance the payment is recorded in (a
 * group's name, or "Not in any group"), and the amount, in the colour of
 * money the reader owes.
 *
 * @param props - Component props.
 * @returns The row inside its list.
 */
export function BillLine({
  description,
  scopeLabel,
  cents,
  currency,
}: {
  /** The bill's name. */
  description: string;
  /** The balance the payment counts in; "" while it is not known. */
  scopeLabel: string;
  /** What is paid, in cents. */
  cents: number;
  /** ISO 4217 code. */
  currency: string;
}) {
  return (
    <ul className="rounded-xl border border-line bg-paper">
      <li className="flex items-center gap-2 px-3 py-2.5 text-sm">
        <ReceiptText className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{description}</span>
          {scopeLabel ? <span className="block truncate text-xs text-ink-soft">{scopeLabel}</span> : null}
        </span>
        <span className="shrink-0 text-xs text-ink-soft">you owe</span>
        <Money cents={cents} currency={currency} className="w-20 text-right font-medium text-neg-600" />
      </li>
    </ul>
  );
}

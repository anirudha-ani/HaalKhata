"use client";
/** One payment made for a bill, from the reader's side, with when it was recorded. */

import { Check } from "lucide-react";
import type { Settlement } from "@haalkhata/shared/api/plainMessages";
import { expensePaymentLine } from "@haalkhata/shared/expense/repayment";
import { localDateTime } from "@haalkhata/shared/time/localTime";

/**
 * Renders "You paid Ana $4.00 via bKash" or "Bob paid you $12.00", ticked,
 * with the moment it was recorded in the reader's own time.
 *
 * @param props - Component props.
 * @returns The line.
 */
export function PaymentLine({
  payment,
  meId,
  otherFirstName,
}: {
  /** The payment. */
  payment: Settlement;
  /** The reader's id. */
  meId: string;
  /** The first name of the other person on it. */
  otherFirstName: string;
}) {
  return (
    <li className="flex items-start gap-2 text-xs text-ink-soft">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pos-600" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {expensePaymentLine(payment, meId, otherFirstName, payment.currency)}
      </span>
      <time className="shrink-0 tabular-nums">{localDateTime(payment.createdAt)}</time>
    </li>
  );
}

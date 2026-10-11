"use client";
/** One payment method in the owner's "Get paid" list: its name, currency, masked summary, star and edit button. */

import { Pencil, Star } from "lucide-react";
import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import {
  methodCurrencyLabel,
  methodCurrencyPhrase,
  methodSummary,
} from "@haalkhata/shared/payment/formatMethod";

/**
 * Renders one of the owner's payment methods.
 *
 * The summary is the method's most identifying detail with account numbers
 * masked to their last characters: this list sits on screen far more often
 * than it is read, and the full details are one tap away in the edit dialog.
 *
 * @param props - Component props.
 * @returns The list row.
 */
export function PaymentMethodRow({
  method,
  error,
  onToggleStar,
  onEdit,
}: {
  /** The method to show. */
  method: PaymentMethod;
  /** Why the last star tap on this row was refused; empty when it was not. */
  error: string;
  /** Called when the star is tapped. */
  onToggleStar: () => void;
  /** Called when the edit button is tapped. */
  onEdit: () => void;
}) {
  const currencyLabel = methodCurrencyLabel(method);
  const currencyPhrase = methodCurrencyPhrase(method);
  return (
    <li className="rounded-xl border border-line bg-paper px-3 py-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 space-y-0.5 py-0.5">
          {/* The name shares its line with the currency only. A "Preferred"
              tag beside it squeezed the name to "bKa…" at 360px, and the
              name is the one thing this row is for. */}
          <p className="flex items-center gap-2 text-sm">
            <span className="truncate font-semibold">{method.name}</span>
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft">
              {currencyLabel}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
            {method.preferred ? (
              <span className="rounded-full bg-pos-50 px-2 py-0.5 text-[11px] font-semibold text-pos-700">
                Preferred
              </span>
            ) : null}
            <span className="min-w-0 truncate">{methodSummary(method)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleStar}
          aria-pressed={method.preferred}
          aria-label={
            method.preferred
              ? `${method.name} is your preferred method for ${currencyPhrase}. Remove the star`
              : `Make ${method.name} your preferred method for ${currencyPhrase}`
          }
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-card hover:text-pos-700"
        >
          <Star
            className={`h-5 w-5 ${method.preferred ? "fill-pos-600 text-pos-600" : ""}`}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${method.name}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-card hover:text-brand-600"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {error ? <p className="pb-1 text-xs font-medium text-brand-600">{error}</p> : null}
    </li>
  );
}

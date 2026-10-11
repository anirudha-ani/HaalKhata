"use client";
/** The currency a payment method works in: one from the catalog, or any. */

import { CurrencySelect } from "@/components/ui/CurrencySelect/CurrencySelect";

/**
 * Renders the method's currency as a picker plus an "any currency" box.
 *
 * Two controls rather than an extra "Any" row in the picker: the picker is
 * the app's shared currency combobox, and a method that works everywhere
 * (PayPal) is a different statement from a 156th currency.
 *
 * @param props - Component props.
 * @returns The field, with its error underneath when it has one.
 */
export function CurrencyField({
  currency,
  anyCurrency,
  error,
  onCurrencyChange,
  onAnyCurrencyChange,
}: {
  /** The selected ISO 4217 code; ignored while `anyCurrency` is set. */
  currency: string;
  /** Whether the method works in every currency. */
  anyCurrency: boolean;
  /** What is wrong with the currency; empty when nothing is. */
  error: string;
  /** Called with the code picked. */
  onCurrencyChange: (currency: string) => void;
  /** Called when the "any currency" box is ticked or unticked. */
  onAnyCurrencyChange: (anyCurrency: boolean) => void;
}) {
  return (
    <div data-form-field className="space-y-1.5 text-sm font-medium">
      <span>Currency it works in</span>
      {anyCurrency ? null : (
        <CurrencySelect
          value={currency}
          onChange={onCurrencyChange}
          ariaLabel="Currency it works in"
        />
      )}
      <label className="flex min-h-11 items-center gap-2 text-sm font-normal text-ink-soft">
        <input
          type="checkbox"
          checked={anyCurrency}
          onChange={(event) => onAnyCurrencyChange(event.target.checked)}
          className="h-4 w-4 accent-brand-600"
        />
        Works in any currency
      </label>
      {error ? (
        <p data-form-error className="text-sm font-medium text-brand-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

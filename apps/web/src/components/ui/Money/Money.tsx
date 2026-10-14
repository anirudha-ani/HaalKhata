/** Formatted money amount, optionally colored by owed/owing sign. */

import { formatMoney } from "@haalkhata/shared/money/money";

/**
 * Renders a formatted money amount with debt semantics: positive = owed to
 * you (emerald), negative = you owe (amber). Unsigned renders in plain ink,
 * and the absolute value is always displayed.
 */
export function Money({
  cents,
  currency,
  signed = false,
  className = "",
}: {
  /** Amount in minor units (cents); the sign encodes debt direction. */
  cents: number;
  /** ISO 4217 currency code used for formatting. */
  currency: string;
  /** When true, colors the amount by the sign of `cents`. */
  signed?: boolean;
  /** Extra class names appended to the rendered span. */
  className?: string;
}) {
  const color = !signed
    ? ""
    : cents > 0
      ? "text-pos-600"
      : cents < 0
        ? "text-neg-600"
        : "text-ink-soft";
  return (
    <span className={`tabular-nums ${color} ${className}`}>
      {formatMoney(Math.abs(cents), currency)}
    </span>
  );
}

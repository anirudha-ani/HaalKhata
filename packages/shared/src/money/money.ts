/** Cents-based money formatting/parsing helpers. */

/** Cache of `Intl.NumberFormat` instances keyed by currency code, so formatters are built once per currency. */
const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats an integer amount of cents as a localized currency string.
 *
 * @param cents - The amount in minor units (cents), e.g. 1250 for $12.50.
 * @param currency - ISO 4217 currency code; falls back to "USD" when empty.
 * @returns The localized currency string, or a plain `"12.50 XYZ"` fallback
 *   when the currency code is not supported by `Intl.NumberFormat`.
 */
export function formatMoney(cents: number, currency: string): string {
  const currencyCode = currency || "USD";
  try {
    let formatter = formatters.get(currencyCode);
    if (!formatter) {
      formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode });
      formatters.set(currencyCode, formatter);
    }
    return formatter.format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currencyCode}`;
  }
}

/**
 * Parses a user-typed money string into integer cents.
 * "12.50" | "12,50" | "12" → 1250; null when not parseable.
 *
 * @param value - The raw text from a money input field.
 * @returns The amount in cents, or `null` when the input is empty or malformed.
 */
export function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

/**
 * Converts integer cents to a two-decimal string suitable for pre-filling a money input.
 *
 * @param cents - The amount in minor units (cents).
 * @returns The amount as a plain decimal string, e.g. 1250 → "12.50".
 */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Returns today's date as an ISO 8601 calendar date — the user's LOCAL
 * today, not UTC's. This value prefills "when did this expense happen", and
 * an evening user west of Greenwich is not having dinner tomorrow.
 *
 * @returns The current local date formatted as "YYYY-MM-DD".
 */
export function todayISO(): string {
  const nowTime = new Date();
  const month = String(nowTime.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(nowTime.getDate()).padStart(2, "0");
  return `${nowTime.getFullYear()}-${month}-${dayOfMonth}`;
}

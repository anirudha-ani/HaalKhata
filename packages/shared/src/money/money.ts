/** Minor-unit money formatting/parsing helpers. */

import { minorUnitDigits } from "./money.constants";

/** Cache of `Intl.NumberFormat` instances keyed by currency code, so formatters are built once per currency. */
const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats an integer amount of minor units as a localized currency string.
 *
 * Amounts are stored in the currency's OWN minor unit (§36): 1250 is $12.50
 * of USD but ¥1,250 of JPY, whose minor unit is the yen itself. The fraction
 * digits are pinned to the catalog's so the display always agrees with what
 * is stored; before §36, JPY went through a hardwired /100 and Intl then
 * rounded the result, which showed an amount nobody entered.
 *
 * @param cents - The amount in the currency's minor units.
 * @param currency - ISO 4217 currency code; falls back to "USD" when empty.
 * @returns The localized currency string, or a plain `"12.50 XYZ"` fallback
 *   when the currency code is not supported by `Intl.NumberFormat`.
 */
export function formatMoney(cents: number, currency: string): string {
  const currencyCode = currency || "USD";
  const digits = minorUnitDigits(currencyCode);
  const amount = cents / 10 ** digits;
  try {
    let formatter = formatters.get(currencyCode);
    if (!formatter) {
      formatter = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      formatters.set(currencyCode, formatter);
    }
    return formatter.format(amount);
  } catch {
    return `${amount.toFixed(digits)} ${currencyCode}`;
  }
}

/**
 * Parses a user-typed money string into integer minor units.
 * For a 2-digit currency, "12.50" | "12,50" | "12" → 1250; null when not
 * parseable or when it carries more decimals than the currency has.
 *
 * @param value - The raw text from a money input field.
 * @param currency - ISO 4217 code whose minor-unit digits bound the
 *   decimals; omitted means 2, the pre-§36 behavior.
 * @returns The amount in minor units, or `null` when empty or malformed.
 */
export function parseMoneyInput(value: string, currency?: string): number | null {
  const digits = currency === undefined ? 2 : minorUnitDigits(currency);
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return null;
  const pattern =
    digits === 0 ? /^\d+$/ : new RegExp(String.raw`^\d+(\.\d{0,${digits}})?$`);
  if (!pattern.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 10 ** digits);
}

/**
 * Converts integer minor units to the decimal string that pre-fills a money
 * input, with the currency's own number of decimals.
 *
 * @param cents - The amount in the currency's minor units.
 * @param currency - ISO 4217 code; omitted means 2 digits, the pre-§36
 *   behavior.
 * @returns e.g. 1250 → "12.50" for USD, "1250" for JPY.
 */
export function centsToInput(cents: number, currency?: string): string {
  const digits = currency === undefined ? 2 : minorUnitDigits(currency);
  return (cents / 10 ** digits).toFixed(digits);
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

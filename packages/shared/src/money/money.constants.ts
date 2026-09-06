/** The currency catalog (full ISO 4217) and expense-category constants. */

import { data as iso4217 } from "currency-codes";
import getSymbolFromCurrency from "currency-symbol-map";

/** One selectable currency, as the pickers and money helpers need it. */
export interface CurrencyInfo {
  /** ISO 4217 code, e.g. "USD". */
  code: string;
  /** The currency's English name, e.g. "US Dollar". */
  name: string;
  /** Display symbol, e.g. "$", "৳"; the code itself when none is common. */
  symbol: string;
  /** Minor-unit digits: 2 for USD cents, 0 for JPY, 3 for KWD fils. */
  digits: number;
}

/**
 * ISO 4217 rows that are not money anyone splits a dinner in: precious
 * metals, bond-market and supranational units of account, national fund or
 * indexation units, and the reserved test/none codes. Everything else in
 * the standard is offered.
 */
const NON_TRANSACTIONAL = new Set([
  "XAU", "XAG", "XPT", "XPD",
  "XBA", "XBB", "XBC", "XBD",
  "XDR", "XSU", "XUA",
  "XTS", "XXX",
  "USN", "CHE", "CHW", "BOV", "CLF", "COU", "MXV", "UYI", "UYW",
]);

/**
 * The familiar codes pinned to the top of every picker, in this order; the
 * rest of the catalog follows alphabetically. These were the entire
 * allowlist before §36, so they are also exactly the codes existing data
 * can contain besides what the full catalog now admits.
 */
const PINNED = ["USD", "EUR", "GBP", "BDT", "INR", "JPY", "CAD", "AUD"];

/**
 * Every selectable currency: the full ISO 4217 catalog minus
 * non-transactional codes, pinned favorites first, the rest alphabetical.
 */
export const CURRENCIES: readonly CurrencyInfo[] = iso4217
  .filter((entry) => !NON_TRANSACTIONAL.has(entry.code))
  .map((entry) => ({
    code: entry.code,
    name: entry.currency,
    symbol: getSymbolFromCurrency(entry.code) ?? entry.code,
    digits: entry.digits,
  }))
  .sort((first, second) => {
    const firstPinned = PINNED.indexOf(first.code);
    const secondPinned = PINNED.indexOf(second.code);
    if (firstPinned !== -1 || secondPinned !== -1) {
      if (firstPinned === -1) return 1;
      if (secondPinned === -1) return -1;
      return firstPinned - secondPinned;
    }
    return first.code.localeCompare(second.code);
  });

const BY_CODE = new Map(CURRENCIES.map((info) => [info.code, info]));

/**
 * Looks a currency up by code.
 *
 * @param code - ISO 4217 code, any casing.
 * @returns Its catalog row, or undefined for anything not offered.
 */
export function currencyInfo(code: string): CurrencyInfo | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/**
 * The minor-unit digits amounts in this currency are stored and typed with.
 * Unknown codes fall back to 2, the behavior every amount had before §36.
 *
 * @param code - ISO 4217 code.
 * @returns 0 for JPY, 3 for KWD, 2 for most, 2 when unrecognized.
 */
export function minorUnitDigits(code: string): number {
  return currencyInfo(code)?.digits ?? 2;
}

/**
 * The label a picker option shows: symbol, code, and name, with the symbol
 * dropped when it would just repeat the code.
 *
 * @param info - The currency to label.
 * @returns e.g. "$ USD · US Dollar" or "KES · Kenyan Shilling".
 */
export function currencyOptionLabel(info: CurrencyInfo): string {
  return info.symbol === info.code
    ? `${info.code} · ${info.name}`
    : `${info.symbol} ${info.code} · ${info.name}`;
}

/** Expense category identifiers shown in category pickers and filters. */
export const CATEGORIES = [
  "general",
  "food",
  "groceries",
  "transport",
  "housing",
  "utilities",
  "entertainment",
  "travel",
  "shopping",
  "health",
];

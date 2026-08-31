/** Shared normalization for values persisted by multiple server domains. */

import { CURRENCIES } from "@haalkhata/shared/money/money.constants";
import { invalid } from "@/server/common/errors";
import { CURRENCY_CODE_PATTERN } from "@/server/common/validation.constants";

/** The currencies the product supports — the same list both clients offer. */
const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set(CURRENCIES);

/**
 * Normalizes and validates a persisted currency code against the product's
 * supported list.
 *
 * Shape alone ("three letters") let a fictional code like ZZZ through and
 * with it a balance nobody could ever settle. The allowlist is the one the
 * pickers on both apps render, so nothing a client can choose is refused.
 *
 * @param value - Client or stored-default currency value.
 * @returns A three-letter uppercase code from the supported list.
 * @throws UsecaseError when the value is malformed or not supported.
 */
export function normalizeCurrencyCode(value: string): string {
  const currencyCode = value.trim().toUpperCase();
  if (!CURRENCY_CODE_PATTERN.test(currencyCode)) {
    invalid("currency must be a three-letter code");
  }
  if (!SUPPORTED_CURRENCIES.has(currencyCode)) {
    invalid(`currency ${currencyCode} is not supported (${CURRENCIES.join(", ")})`);
  }
  return currencyCode;
}

/**
 * Whether text names a real ISO calendar day, not merely a YYYY-MM-DD shape.
 *
 * JavaScript's Date normalises an impossible day instead of rejecting it:
 * 2026-02-31 quietly becomes March 3rd and 2026-02-29 becomes March 1st,
 * both "valid". Only an exact round trip proves the day exists — the check
 * Temporal.PlainDate.from would make for you.
 *
 * @param value - Candidate YYYY-MM-DD string.
 * @returns True when the date exists in the calendar.
 */
export function isRealCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

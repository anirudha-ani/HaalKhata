/** Shared normalization for values persisted by multiple server domains. */

import { invalid } from "@/server/common/errors";
import { CURRENCY_CODE_PATTERN } from "@/server/common/validation.constants";

/**
 * Normalizes and validates a persisted currency code.
 *
 * @param value - Client or stored-default currency value.
 * @returns A three-letter uppercase code.
 * @throws UsecaseError when the value is not exactly three ASCII letters.
 */
export function normalizeCurrencyCode(value: string): string {
  const currencyCode = value.trim().toUpperCase();
  if (!CURRENCY_CODE_PATTERN.test(currencyCode)) {
    invalid("currency must be a three-letter code");
  }
  return currencyCode;
}

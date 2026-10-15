/** Prevent receipt minor units from being silently interpreted as another currency. */

/**
 * Explains a detected receipt/form currency mismatch before importing amounts.
 * @param receiptCurrency - Currency reported by the receipt parser; empty means unknown.
 * @param expenseCurrency - Currency of the current expense form.
 * @returns Visible correction guidance, or an empty string when importing is safe.
 */
export function receiptCurrencyError(receiptCurrency: string, expenseCurrency: string): string {
  const detected = receiptCurrency.trim().toUpperCase();
  const selected = expenseCurrency.trim().toUpperCase();
  return detected && detected !== selected
    ? `This receipt is in ${detected}; the expense uses ${selected}. Enter the amounts manually in ${selected}.`
    : "";
}

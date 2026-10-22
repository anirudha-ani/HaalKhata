/** Shared equal-split wording that respects currency precision and remainder units. */
import { formatMoney } from "../../money/money";

/**
 * Describes the actual range of allocated equal shares, without rounding every
 * person to the same amount when the total cannot be divided exactly.
 * @param totalCents - Total in integer currency minor units.
 * @param peopleCount - Number of selected participants.
 * @param currency - ISO 4217 currency code.
 * @returns Currency-aware summary, or empty while the inputs are incomplete.
 */
export function equalSplitSummary(totalCents: number, peopleCount: number, currency: string): string {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || !Number.isSafeInteger(peopleCount) || peopleCount <= 0) return "";
  const smallest = Math.floor(totalCents / peopleCount);
  const largest = Math.ceil(totalCents / peopleCount);
  const amount = smallest === largest
    ? formatMoney(smallest, currency)
    : `${formatMoney(smallest, currency)}–${formatMoney(largest, currency)}`;
  return `${amount} each · ${peopleCount} ${peopleCount === 1 ? "person" : "people"}`;
}

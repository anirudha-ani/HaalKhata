/** Pure construction of the spending-by-month chart both apps draw. */

import { monthLabel } from "../activity/format";
import { formatMoney } from "../money/money";
import { moneyCeiling } from "./chart";
import { monthShortLabel } from "./insights";

/** One month of the spending chart, ready to draw. */
export interface SpendingColumn {
  /** The month's "YYYY-MM" key. */
  key: string;
  /** Short text under the column, e.g. "Oct". */
  axisLabel: string;
  /** Full name, e.g. "October 2026". */
  name: string;
  /** The person's share that month, in the currency's minor units. */
  value: number;
  /** The share as a person reads it, e.g. "$412.00". */
  valueLabel: string;
}

/**
 * Lays a currency's monthly shares out as chart columns and picks the round
 * amount the value axis ends on.
 *
 * A month the amounts list has no entry for draws as zero rather than being
 * dropped, so the columns always line up with the window's months.
 *
 * @param months - The window's "YYYY-MM" keys, oldest first.
 * @param monthlyShareCents - The share per month, aligned with `months`.
 * @param currency - ISO 4217 code the amounts are in.
 * @returns The columns, oldest first, and the axis ceiling in minor units.
 */
export function spendingColumns(
  months: readonly string[],
  monthlyShareCents: readonly number[],
  currency: string,
): { columns: SpendingColumn[]; ceiling: number } {
  const columns = months.map((month, index) => {
    const cents = monthlyShareCents[index] ?? 0;
    return {
      key: month,
      axisLabel: monthShortLabel(month),
      name: monthLabel(month),
      value: cents,
      valueLabel: formatMoney(cents, currency),
    };
  });
  const largest = columns.reduce((maximum, column) => Math.max(maximum, column.value), 0);
  return { columns, ceiling: moneyCeiling(largest, currency) };
}

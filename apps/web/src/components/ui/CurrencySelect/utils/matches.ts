/** Search matching for the currency combobox. */

import { type CurrencyInfo } from "@haalkhata/shared/money/money.constants";

/**
 * Whether a catalog row matches a search query, on code, name, or symbol.
 *
 * @param info - Candidate currency.
 * @param query - Lowercased search text.
 * @returns True when the row should stay listed.
 */
export function matches(info: CurrencyInfo, query: string): boolean {
  return (
    info.code.toLowerCase().includes(query) ||
    info.name.toLowerCase().includes(query) ||
    info.symbol.toLowerCase().includes(query)
  );
}

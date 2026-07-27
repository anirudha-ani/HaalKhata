/** Client-side list filtering: whitespace-tokenised, order-independent matching. */

/**
 * Splits a raw query into lowercase search terms.
 *
 * @param query - Raw text typed into a search field.
 * @returns The terms to match, or an empty array for a blank query.
 */
export function searchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Whether every term appears somewhere in `fields`.
 *
 * Terms are matched independently and in any order, so "test ani" finds
 * "Ani Test" — substring matching on the joined string would not. A term made
 * only of digits is also matched against the fields' digits, so "415 555"
 * finds the phone number "+1 (415) 555-2671" whatever way it is punctuated.
 *
 * @param terms - Terms from {@link searchTerms}; an empty array matches everything.
 * @param fields - The values to search (undefined and empty entries are ignored).
 * @returns True when the row should be shown.
 */
export function matchesTerms(terms: string[], ...fields: (string | undefined)[]): boolean {
  if (terms.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  const digits = haystack.replace(/\D/g, "");
  return terms.every((term) =>
    /^\d+$/.test(term) ? digits.includes(term) : haystack.includes(term),
  );
}

/**
 * Convenience wrapper that tokenises `query` and matches it in one call. Use
 * {@link matchesTerms} directly inside a loop so the query is only tokenised
 * once per keystroke rather than once per row.
 *
 * @param query - Raw text typed into a search field.
 * @param fields - The values to search.
 * @returns True when the row should be shown.
 */
export function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  return matchesTerms(searchTerms(query), ...fields);
}

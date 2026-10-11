/** Narrows the admin people list to names matching a search. */

import type { UserUsage } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";

/**
 * Narrows the people list to names matching a search.
 *
 * @param people - Everyone the overview lists.
 * @param searchText - What was typed; empty matches everyone.
 * @returns The people whose name contains every term.
 */
export function searchPeople(people: readonly UserUsage[], searchText: string): UserUsage[] {
  const terms = searchTerms(searchText);
  return people.filter((person) => matchesTerms(terms, person.name));
}

/** Select shared settlement groups without rescanning a large request for every group. */

/**
 * Keeps shared groups in their existing order and retains their complete metadata.
 * An empty selection covers every shared group; the empty-string direct scope
 * and unknown ids never add a group. Index the request once so duplicate-heavy
 * selections take work proportional to the request plus the shared group list.
 * @param sharedGroups Active groups already shared by both payment parties.
 * @param selectedScopeIds Requested group ids, with an empty string for one-offs.
 * @returns Only the shared groups selected by the request, or all when unspecified.
 */
export function filterSettlementGroups<Group extends { id: string }>(
  sharedGroups: readonly Group[],
  selectedScopeIds: readonly string[],
): Group[] {
  if (selectedScopeIds.length === 0) return [...sharedGroups];
  const selectedIds = new Set(selectedScopeIds);
  return sharedGroups.filter((group) => selectedIds.has(group.id));
}

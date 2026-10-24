/** Pure shaping of expense counts by split type for the usage overview. */

/**
 * Turns a split type → count object into a list, most used first.
 *
 * @param bySplitType - Counts keyed by split type.
 * @returns The same counts as an ordered list, zero counts dropped.
 */
export function rankSplitTypes(
  bySplitType: Readonly<Record<string, number>>,
): { splitType: string; count: number }[] {
  return Object.entries(bySplitType)
    .filter(([, count]) => count > 0)
    .map(([splitType, count]) => ({ splitType, count }))
    .sort(
      (first, second) =>
        second.count - first.count || first.splitType.localeCompare(second.splitType),
    );
}

/** Decides how many entries of a list fit a stack with a fixed number of slots. */

/**
 * Splits a list for a stack with `slots` places. Everything is shown when it
 * fits; otherwise the last slot is given to the "+N" count, so a long list
 * takes exactly as much room as a full one and never more.
 *
 * @param entries - The whole list, in display order.
 * @param slots - How many places the stack has, the count included.
 * @returns The entries to draw and how many are left out.
 */
export function capStack<Entry>(
  entries: Entry[],
  slots: number,
): { shown: Entry[]; hiddenCount: number } {
  if (entries.length <= slots) return { shown: entries, hiddenCount: 0 };
  const shown = entries.slice(0, Math.max(slots - 1, 0));
  return { shown, hiddenCount: entries.length - shown.length };
}

/** Labels the switch to the report queue with how much is waiting. */

/**
 * Builds the queue's label for the page's view switch, so the count of
 * waiting content is visible from the usage view too.
 *
 * @param waiting - Pieces of content in the queue, as listed.
 * @param truncated - Whether more are waiting than the list holds.
 * @returns "Reports" when nothing waits, otherwise the count in brackets.
 */
export function reportsTabLabel(waiting: number, truncated: boolean): string {
  if (waiting === 0) return "Reports";
  return `Reports (${waiting.toLocaleString()}${truncated ? "+" : ""})`;
}

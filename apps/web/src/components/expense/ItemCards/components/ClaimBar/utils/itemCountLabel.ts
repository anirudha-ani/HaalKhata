/** Words how many items a person is on, for the claim bar's rows. */

/**
 * Words how many items a person is on, for the picker's rows.
 *
 * @param count - The number of items.
 * @returns "No items", "1 item" or "N items".
 */
export function itemCountLabel(count: number): string {
  if (count === 0) return "No items";
  return `${count} item${count === 1 ? "" : "s"}`;
}

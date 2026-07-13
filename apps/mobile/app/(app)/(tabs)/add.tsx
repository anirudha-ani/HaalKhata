/** Placeholder route for the center tab slot; its button pushes /expenses/new instead. */

/**
 * Never rendered — the tab bar replaces this screen's button with
 * AddExpenseTabButton, which navigates to the new-expense screen.
 *
 * @returns Nothing; the route exists only to reserve the tab slot.
 */
export default function AddPlaceholder() {
  return null;
}

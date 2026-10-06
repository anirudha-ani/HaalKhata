/** Claim-mode helpers for the item cards: whose items are being checked off, and how many each person is on. */

/** The one field of a line item the counts depend on; any item shape with it fits. */
export interface ClaimableItem {
  /** Portion count per user id; 0 or absent means "not on this item". */
  assignees: Record<string, number>;
}

/**
 * Decides whose items the cards are being checked off for.
 *
 * Whoever was picked wins for as long as they are on the expense. With
 * nobody picked (or the pick since removed) a phone falls back to the
 * signed-in user, because its picker always shows someone; a wider screen
 * falls back to nobody, where claiming stays something you opt into.
 *
 * @param people - Everyone on the expense.
 * @param pickedId - Id of the person chosen in the claim bar, or null.
 * @param currentUserId - Id of the signed-in user.
 * @param startWithCurrentUser - Whether an empty pick means the signed-in user.
 * @returns The person being claimed for, or null when claiming is off.
 */
export function resolveClaimer<Person extends { id: string }>(
  people: Person[],
  pickedId: string | null,
  currentUserId: string,
  startWithCurrentUser: boolean,
): Person | null {
  const picked = people.find((person) => person.id === pickedId);
  if (picked) return picked;
  if (!startWithCurrentUser) return null;
  return people.find((person) => person.id === currentUserId) ?? null;
}

/**
 * Counts the items each person is on, however many portions they have.
 *
 * @param items - The itemized draft.
 * @returns Item count per user id; people on nothing are absent.
 */
export function countClaimedItems(items: ClaimableItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    for (const [userId, weight] of Object.entries(item.assignees)) {
      if (weight > 0) counts[userId] = (counts[userId] ?? 0) + 1;
    }
  }
  return counts;
}

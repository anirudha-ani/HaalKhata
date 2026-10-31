/** How often the apps look for changes to an expense somebody has open. */

/** How often an open edit form asks whether anyone has saved a change. */
export const EXPENSE_EDIT_CHECK_INTERVAL_MS = 10_000;

/** How many parts a note about somebody else's changes names before it says "and more". */
export const MAX_NAMED_CHANGES = 3;

/** What the server answers when two people changed the same thing; the apps read the latest and show the choice. */
export const EDIT_CONFLICT_MESSAGE = "someone else changed the same thing while you were editing";

/** Persisted text-length limits, shared so the server validators and both clients' inputs agree. */

/**
 * Maximum display-name length. Names are copied into activity and
 * notification rows, so one long name fans out into many long rows.
 */
export const MAX_USER_NAME_LENGTH = 120;

/** Maximum group-name length; group names fan out the same way. */
export const MAX_GROUP_NAME_LENGTH = 120;

/** Maximum expense description length. */
export const MAX_EXPENSE_DESCRIPTION_LENGTH = 200;

/** Maximum free-form expense notes length. */
export const MAX_EXPENSE_NOTES_LENGTH = 2000;

/** Maximum receipt line-item name length. */
export const MAX_EXPENSE_ITEM_NAME_LENGTH = 200;

/** Maximum free-form settlement note length. */
export const MAX_SETTLEMENT_NOTE_LENGTH = 1000;

/** Maximum comment body length. */
export const MAX_COMMENT_LENGTH = 2000;

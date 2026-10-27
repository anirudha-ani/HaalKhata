/** Page sizes and wording shared by the paged lists both apps read. */

/** Expenses one page of any expense list asks for. */
export const EXPENSE_PAGE_SIZE = 50;

/** Lines one page of a friend statement asks for. */
export const STATEMENT_PAGE_SIZE = 50;

/** Comments one page of an expense's thread asks for. */
export const COMMENT_PAGE_SIZE = 30;

/**
 * Lines a settle dialog asks GetFriendLedger for. It reads the position and
 * the payee's methods, never the statement's lines, so it asks for the
 * smallest page there is.
 */
export const SETTLE_DIALOG_LEDGER_LIMIT = 1;

/**
 * Shown beside Show more when an older page of a statement was refused
 * because a line changed since the first page was read: the apps then read
 * every loaded page again, so the figures on screen are the current ones.
 */
export const STATEMENT_RELOADED_NOTICE =
  "This statement changed while you were reading it, so it was reloaded with the current figures.";

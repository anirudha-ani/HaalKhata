/** Page sizes and wording shared by the paged lists both apps read: what they ask for, and what their controls say. */

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

/** What the button under a paged list says. */
export const SHOW_MORE_LABEL = "Show me more";

/** What the button under a friend statement says. */
export const SHOW_OLDER_LINES_LABEL = "Show older lines";

/** What the button above an expense's comments says. */
export const SHOW_EARLIER_COMMENTS_LABEL = "Show earlier comments";

/** Said under a list once every row is loaded, as the activity feed says it. */
export const LIST_END_LINE = "You've hit the bottom.";

/**
 * Said under a statement once its first line is loaded.
 *
 * @param firstName - The friend's first name.
 * @returns The line.
 */
export function statementEndLine(firstName: string): string {
  return `That's your whole history with ${firstName}.`;
}

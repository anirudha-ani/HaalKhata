/** Expense domain constants. */

import { CATEGORIES } from "@haalkhata/shared/money/money.constants";
import { PAYMENT_METHOD_KEYS } from "@haalkhata/shared/payment/methods";
import {
  MAX_COMMENT_LENGTH,
  MAX_EXPENSE_DESCRIPTION_LENGTH,
  MAX_EXPENSE_ITEM_NAME_LENGTH,
  MAX_EXPENSE_NOTES_LENGTH,
  MAX_SETTLEMENT_NOTE_LENGTH,
} from "@haalkhata/shared/text/limits";

/** The refusal for a one-off expense with somebody the caller is not connected to. */
export const ONE_OFF_NOT_CONNECTED_MESSAGE =
  "you can only split with people you already share a friendship or a group with";

/**
 * Why a change touching a former member's group balance is refused. Named by
 * group because a payment is removed from a friend's page, where no group
 * is on screen.
 *
 * @param groupName - The group they left.
 * @param personName - The member who left; omitted when it is the reader.
 * @param refused - What cannot happen, when "this can't be changed" is too broad.
 * @returns The sentence shown beside the refused control.
 */
export function formerMemberRefusal(
  groupName: string,
  personName?: string,
  refused = "this can't be changed",
): string {
  return personName === undefined
    ? `You have left "${groupName}", so ${refused}: your balance there has to stay settled`
    : `${personName} has left "${groupName}", so ${refused}: their balance there has to stay settled`;
}

/** Split types the API accepts; mirrors the split calculators in domain/splits. */
export const SPLIT_TYPES = new Set(["equal", "exact", "percent", "shares", "itemized"]);

/** YYYY-MM-DD calendar date pattern (the format stored in expenses.expense_date). */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Maximum participants/payers/items allowed on a single expense (DoS guard). */
export const MAX_EXPENSE_PARTICIPANTS = 100;

/** Maximum assignees on one itemized line item (DoS and SQL parameter guard). */
export const MAX_ITEM_ASSIGNMENTS = 100;

/**
 * Largest monetary value accepted for one stored field or transaction.
 * This stays below PostgreSQL/protobuf signed-int32 limits and leaves a small
 * margin so downstream formatting and arithmetic never approach overflow.
 */
export const MAX_MONEY_CENTS = 2_000_000_000;

/**
 * Lines in the one page of a friend statement an app version from before
 * paging asks for (limit 0), with `truncated` saying when more were left off.
 */
export const LEDGER_DISPLAY_LIMIT = 300;

/**
 * Where lines written on one day and moment fall in a friend statement,
 * oldest first: an expense, then the balances a net settlement cancelled,
 * then the payment itself. Part of the statement's order key, in memory and
 * in the page queries alike.
 */
export const LEDGER_LINE_RANK = { expense: 0, offset: 1, payment: 2 } as const;

/** Lines in a page of a friend statement when the client names no size. */
export const LEDGER_PAGE_SIZE = 50;

/** Most lines one page of a friend statement may hold. */
export const MAX_LEDGER_PAGE_SIZE = 200;

/**
 * Why a later page of a friend statement was refused: a line was added,
 * edited or removed since the first page was read, so the running balance
 * that page would continue from no longer holds. Clients reload the
 * statement from the top when they get it (failed_precondition).
 */
export const LEDGER_CHANGED_MESSAGE =
  "this statement changed while you were reading it — reload it to see the current figures";

/**
 * Rows in the one page of an expense list an app version from before paging
 * asks for (limit 0), with `truncated` saying when more were left off.
 */
export const EXPENSE_LIST_DISPLAY_LIMIT = 500;

/** Rows in a page of an expense list when the client names no size. */
export const EXPENSE_PAGE_SIZE = 50;

/** Most rows one page of an expense list may hold. */
export const MAX_EXPENSE_PAGE_SIZE = 200;

/** Comments in a page when the client names no size. */
export const COMMENT_PAGE_SIZE = 30;

/** Most comments one page may hold. */
export const MAX_COMMENT_PAGE_SIZE = 100;

/**
 * Text bounds on the expense write path. Defined once in the shared package
 * and re-exported here, so both clients cap their inputs at exactly what the
 * server (and the matching database CHECKs) will accept.
 */
export {
  MAX_COMMENT_LENGTH,
  MAX_EXPENSE_DESCRIPTION_LENGTH,
  MAX_EXPENSE_ITEM_NAME_LENGTH,
  MAX_EXPENSE_NOTES_LENGTH,
  MAX_SETTLEMENT_NOTE_LENGTH,
};

/**
 * Expense categories the API accepts; anything else falls back to "general".
 * Everything the clients' pickers offer (the shared CATEGORIES list) plus two
 * legacy values older rows still carry. The database CHECK in
 * 1788220800000_enforce_domain_constraints.sql lists the same set, so a
 * choice the pickers offer is never silently stored as "general".
 */
export const EXPENSE_CATEGORIES = new Set([...CATEGORIES, "lodging", "other"]);

/** Payment methods accepted for a settlement; anything else falls back to "cash". */
export const SETTLEMENT_METHODS = new Set(PAYMENT_METHOD_KEYS);

/**
 * Method stored on a settlement row that cancels one balance against another
 * instead of recording money that moved. Only the server writes it, when a
 * pair is settled on their net across scopes; it is deliberately not in
 * {@link SETTLEMENT_METHODS}, so no client can claim it for a payment.
 */
export const OFFSET_SETTLEMENT_METHOD = "offset";

/** Activity type for an offset entry, so a feed never shows one as a payment. */
export const OFFSET_ACTIVITY_TYPE = "settlement_offset";

/**
 * How much of a comment is quoted in the activity feed line and the
 * notification body. A feed row is one truncated line, so this only has to be
 * short enough to stay a preview and long enough to carry a whole short remark.
 */
export const COMMENT_PREVIEW_LENGTH = 120;

/**
 * Tries a payment between two people gets when a group becomes shared
 * between them while it is being recorded. Each try locks the groups they
 * share at that moment; a roster change landing in between that often is
 * not a race any more, and the person is asked to look again.
 */
export const SETTLEMENT_ATTEMPTS = 3;

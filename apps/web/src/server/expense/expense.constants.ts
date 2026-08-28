/** Expense domain constants. */

import { PAYMENT_METHOD_KEYS } from "@haalkhata/shared/payment/methods";

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

/** Expense categories the API accepts; anything else falls back to "general". */
export const EXPENSE_CATEGORIES = new Set([
  "general", "food", "transport", "lodging", "utilities", "shopping", "entertainment", "other",
]);

/** Payment methods accepted for a settlement; anything else falls back to "cash". */
export const SETTLEMENT_METHODS = new Set(PAYMENT_METHOD_KEYS);

/** Maximum comment body length accepted on addComment. */
export const MAX_COMMENT_LENGTH = 2000;

/**
 * How much of a comment is quoted in the activity feed line and the
 * notification body. A feed row is one truncated line, so this only has to be
 * short enough to stay a preview and long enough to carry a whole short remark.
 */
export const COMMENT_PREVIEW_LENGTH = 120;

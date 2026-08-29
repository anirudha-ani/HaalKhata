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
 * How much of a comment is quoted in the activity feed line and the
 * notification body. A feed row is one truncated line, so this only has to be
 * short enough to stay a preview and long enough to carry a whole short remark.
 */
export const COMMENT_PREVIEW_LENGTH = 120;

/** Expense domain constants. */

/** Split types the API accepts; mirrors the split calculators in domain/splits. */
export const SPLIT_TYPES = new Set(["equal", "exact", "percent", "shares", "itemized"]);

/** YYYY-MM-DD calendar date pattern (the format stored in expenses.expense_date). */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Maximum participants/payers/items allowed on a single expense (DoS guard). */
export const MAX_EXPENSE_PARTICIPANTS = 100;

/** Expense categories the API accepts; anything else falls back to "general". */
export const EXPENSE_CATEGORIES = new Set([
  "general", "food", "transport", "lodging", "utilities", "shopping", "entertainment", "other",
]);

/** Payment methods accepted for a settlement; anything else falls back to "cash". */
export const SETTLEMENT_METHODS = new Set(["cash", "bank", "bkash", "card", "other"]);

/** Maximum comment body length accepted on addComment. */
export const MAX_COMMENT_LENGTH = 2000;

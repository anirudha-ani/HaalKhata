/** Expense domain constants. */

/** Split types the API accepts; mirrors the split calculators in domain/splits. */
export const SPLIT_TYPES = new Set(["equal", "exact", "percent", "shares", "itemized"]);

/** YYYY-MM-DD calendar date pattern (the format stored in expenses.expense_date). */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Maximum participants/payers/items allowed on a single expense (DoS guard). */
export const MAX_EXPENSE_PARTICIPANTS = 100;

/**
 * The SQL that tells one payment from another. What a person records in one
 * go is one payment, however many settlement rows it is stored as.
 */

/**
 * The columns that together name one payment, for a `settlements stl`
 * alias. Group by them to count payments rather than rows.
 *
 * A payment recorded from a person's page settles every place the debt
 * lives (the pair's one-off ledger and each group they share) with a row
 * of its own, and a net settlement adds cancelling rows beside the cash.
 * All of them are written by one request in one transaction
 * (recordSettlement), and settlements.repo.ts is the only writer. They
 * share who recorded them, who paid whom and the currency, and their
 * created_at is identical: it defaults to now(), the time the transaction
 * started, not the time of each insert. Two payments are never recorded in
 * one transaction, so no two of them share all five.
 */
export const PAYMENT_KEY = "stl.recorded_by, stl.from_user, stl.to_user, stl.currency, stl.created_at";

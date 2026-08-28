/** Namespaces for transaction-scoped Postgres advisory ledger locks. */

/** Advisory-lock namespace for a group ledger. */
export const GROUP_LEDGER_LOCK_PREFIX = "ledger:group:";

/** Advisory-lock namespace for a one-off user-pair ledger. */
export const PAIR_LEDGER_LOCK_PREFIX = "ledger:pair:";

/** Advisory-lock namespace for serializing mutations of one expense row. */
export const EXPENSE_LEDGER_LOCK_PREFIX = "ledger:expense:";

/** Namespaces for transaction-scoped Postgres advisory ledger locks. */

/** Advisory-lock namespace for a group ledger. */
export const GROUP_LEDGER_LOCK_PREFIX = "ledger:group:";

/**
 * Advisory-lock namespace for one person's one-off ledgers. One key per
 * participant, not per pair: the pair set is quadratic in the cast and
 * overflows Postgres's shared lock table long before the 100-participant
 * request ceiling (see lockParticipantLedgers).
 */
export const PARTICIPANT_LEDGER_LOCK_PREFIX = "ledger:participant:";

/** Advisory-lock namespace for serializing mutations of one expense row. */
export const EXPENSE_LEDGER_LOCK_PREFIX = "ledger:expense:";

/** Advisory-lock key prefix serializing reminders from one person to another. */
export const REMINDER_LOCK_PREFIX = "reminder:";

/**
 * Advisory-lock key prefix serializing one person's friend-request inbox.
 * Friend-request writers and account merges take these locks first, in
 * sorted order, before any row locks on users — one shared spelling,
 * because two modules locking "the same" inbox under different keys would
 * exclude nothing.
 */
export const FRIEND_REQUEST_INBOX_LOCK_PREFIX = "friend-request-inbox:";

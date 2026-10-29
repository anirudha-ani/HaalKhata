/** Namespaces for transaction-scoped Postgres advisory ledger locks, and how long a ledger transaction may wait. */

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

/**
 * Advisory-lock key prefix serializing changes to one person's payment
 * methods. The cap on how many they keep and the one-star-per-currency rule
 * are both read-then-write, so two saves for the same person take turns.
 */
export const PAYMENT_METHODS_LOCK_PREFIX = "payment-methods:";

/**
 * Longest a ledger transaction waits for a lock (5 s). Ledger locks are held
 * for milliseconds, so a wait this long means something is stuck or being
 * abused; giving up answers the person and frees the connection, where
 * waiting on would hold one of the pool's few connections indefinitely.
 */
export const LEDGER_LOCK_TIMEOUT_MS = 5_000;

/**
 * Longest one statement in a ledger transaction may run (15 s), well above
 * the slowest balance read of a full group.
 */
export const LEDGER_STATEMENT_TIMEOUT_MS = 15_000;

/**
 * Postgres error codes for a ledger change that gave up and rolled back: a
 * lock wait or a statement that ran out of time, and a deadlock Postgres
 * broke by cancelling this transaction. Each is answered as busy, with
 * nothing saved — a deadlock is two changes colliding, not a fault, and
 * trying again goes through.
 */
export const LEDGER_BUSY_ERROR_CODES: ReadonlySet<string> = new Set(["55P03", "57014", "40P01"]);

/** What a person is told when their change gave up waiting: nothing was saved. */
export const LEDGER_BUSY_MESSAGE =
  "lots of changes are landing on these balances right now — nothing was saved, try again in a moment";

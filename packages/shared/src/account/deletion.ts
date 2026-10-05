/** Account-erasure confirmation and effects, shared by both clients and the server. */

/** Explicit irreversible-action proof sent by both clients. */
export const ACCOUNT_DELETION_CONFIRMATION = "DELETE";
/** Personal data removed by the authenticated deletion operation. */
export const ACCOUNT_ERASURE_MESSAGE = "Your profile, sign-in credentials, payment handles, comments, invitations and notifications will be erased. Apple access will be revoked.";
/** Explains why anonymous shared financial entries remain after account deletion. */
export const SHARED_LEDGER_ERASURE_MESSAGE = "Shared ledger amounts remain under a new anonymous “Deleted member” so other people's balances stay intact. This cannot be undone. Signing in again creates a new account.";

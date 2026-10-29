/** Where a join link waiting for sign-in is kept on the phone, and for how long it counts. */

/** Storage key for the saved invite: its token and when it was saved. */
export const PENDING_INVITE_STORAGE_KEY = "haalkhata.pendingInvite";

/**
 * Storage key earlier versions kept a bare token under, with no time on it.
 * Nothing is read from it any more; it is only removed.
 */
export const LEGACY_PENDING_INVITE_STORAGE_KEY = "haalkhata.pendingInviteToken";

/**
 * How long a saved invite waits for a sign-in: long enough to finish signing
 * in, short enough that one left behind does not greet whoever signs in on
 * this phone next.
 */
export const PENDING_INVITE_LIFETIME_MS = 30 * 60 * 1000;

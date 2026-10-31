/** Sizes and timings of the in-process rate limiters. */

/** Default window a limit counts attempts in: one minute. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** How often a limiter sweeps out buckets whose attempts have all expired. */
export const RATE_LIMIT_SWEEP_INTERVAL_MS = 60_000;

/**
 * How often a full table may sweep before dropping a bucket still counting,
 * so expired buckets go first; at most once a second keeps a flood from
 * making every request walk the whole table.
 */
export const RATE_LIMIT_FULL_SWEEP_INTERVAL_MS = 1_000;

/**
 * Buckets kept for callers who are not signed in, keyed by network (an IPv4
 * address, or an IPv6 /64). Anyone can make these, so the table is small and
 * kept apart from every account's.
 */
export const MAX_TRACKED_ADDRESS_KEYS = 10_000;

/**
 * Buckets kept for signed-in callers, keyed by account. Only an account
 * Google or Apple vouched for can make one, so this table only fills with
 * real people, a few buckets each while they are active.
 */
export const MAX_TRACKED_ACCOUNT_KEYS = 100_000;

/** Buckets kept for the admin page: its sign-in per network, and its shared reads and writes. */
export const MAX_TRACKED_ADMIN_KEYS = 1_000;

/**
 * Oldest buckets a full table looks through for one it may drop before
 * letting a new caller through untracked. Bounds the work a flood can cause
 * per request.
 */
export const RATE_LIMIT_EVICTION_SCAN = 64;

/**
 * In-memory sliding-window rate limiters for abuse protection. There are
 * three, each its own table: callers not signed in (keyed by network),
 * signed-in callers (keyed by account) and the admin page. A flood of
 * anonymous calls — anyone can make those, from as many IPv6 addresses as
 * they like — fills only the first, so it can never push an account's
 * counters out and reset them.
 *
 * They are in-process and per-instance; a deployment with several replicas
 * would need a shared store. Limits that guard secrets (phone-code guesses,
 * SMS sends) are kept in Postgres instead, and do not depend on these.
 */

import {
  MAX_TRACKED_ACCOUNT_KEYS,
  MAX_TRACKED_ADDRESS_KEYS,
  MAX_TRACKED_ADMIN_KEYS,
  RATE_LIMIT_EVICTION_SCAN,
  RATE_LIMIT_FULL_SWEEP_INTERVAL_MS,
  RATE_LIMIT_SWEEP_INTERVAL_MS,
  RATE_LIMIT_WINDOW_MS,
} from "./rateLimit.constants";

/** One bucket per key: recent attempts, the window they count in, and the limit last applied. */
interface Bucket {
  /** Timestamps (ms) of the attempts still inside the window. */
  attempts: number[];
  /** Length of this bucket's window; buckets keyed for an hour keep an hour. */
  windowMs: number;
  /** The most attempts the window allows, as of the last check. */
  maxAttempts: number;
}

/** One table of buckets and the checks against it. */
export interface RateLimiter {
  /**
   * Records an attempt for the key and reports whether it is within the
   * limit. Keys are caller-defined (e.g. `rpc:create-group:<user id>`); a
   * key that counts over a longer window should say so in its name, since
   * the first call fixes the bucket's window.
   *
   * @param rateLimitKey - Identifier of the rate-limited actor and action.
   * @param maxAttempts - Maximum attempts allowed within the rolling window.
   * @param windowMs - Length of the rolling window; one minute by default.
   * @returns True when the attempt is allowed; false when the limit is reached.
   */
  check(rateLimitKey: string, maxAttempts: number, windowMs?: number): boolean;
  /**
   * Whether one more attempt for the key would be allowed, without recording
   * one. For a caller that should refuse early but only spend the attempt
   * once the work actually starts — a receipt scan that waits for a lane.
   *
   * @param rateLimitKey - Identifier of the rate-limited actor and action.
   * @param maxAttempts - Maximum attempts allowed within the rolling window.
   * @returns True when {@link RateLimiter.check} would allow the next attempt now.
   */
  wouldAllow(rateLimitKey: string, maxAttempts: number): boolean;
  /** How many buckets the table holds, for diagnostics and tests. */
  size(): number;
}

/**
 * Removes attempt timestamps older than the bucket's window, in place.
 *
 * @param bucket - The bucket.
 * @param currentTime - Now, in ms.
 */
function prune(bucket: Bucket, currentTime: number): void {
  const cutoff = currentTime - bucket.windowMs;
  bucket.attempts = bucket.attempts.filter((timestamp) => timestamp >= cutoff);
}

/**
 * Whether a bucket is turning its caller away right now.
 *
 * @param bucket - A bucket already pruned to the current time.
 * @returns True when its window is full.
 */
function isRefusing(bucket: Bucket): boolean {
  return bucket.attempts.length >= bucket.maxAttempts;
}

/**
 * Creates one limiter with its own table of at most `maxKeys` buckets.
 *
 * When the table is full and a new caller arrives, it makes room by
 * sweeping out buckets whose attempts have all expired (at most once a
 * second), else by dropping the least recently used bucket that is not
 * refusing anyone. A refusing bucket is never dropped:
 * a caller who has been told to wait cannot undo that by flooding the table.
 * If the oldest {@link RATE_LIMIT_EVICTION_SCAN} buckets are all refusing,
 * the newcomer is let through untracked rather than shutting every new
 * caller out.
 *
 * @param maxKeys - Most buckets the table holds.
 * @returns The limiter.
 */
export function createRateLimiter(maxKeys: number): RateLimiter {
  const buckets = new Map<string, Bucket>();
  let lastSweepAt = 0;

  /**
   * Removes every bucket with no attempt left inside its window.
   *
   * @param currentTime - Now, in ms.
   */
  const sweep = (currentTime: number) => {
    for (const [rateLimitKey, bucket] of buckets) {
      prune(bucket, currentTime);
      if (bucket.attempts.length === 0) buckets.delete(rateLimitKey);
    }
    lastSweepAt = currentTime;
  };

  /**
   * Drops one bucket to make room: an expired one or the least recently
   * used one not refusing anyone. Refusing buckets met on the way move to
   * the newest end, so the next search does not walk past them again.
   *
   * @param currentTime - Now, in ms.
   * @returns Whether a bucket was dropped.
   */
  const makeRoom = (currentTime: number): boolean => {
    for (let looked = 0; looked < RATE_LIMIT_EVICTION_SCAN; looked++) {
      const oldest = buckets.entries().next().value;
      if (oldest === undefined) return true;
      const [rateLimitKey, bucket] = oldest;
      buckets.delete(rateLimitKey);
      prune(bucket, currentTime);
      if (bucket.attempts.length === 0 || !isRefusing(bucket)) return true;
      buckets.set(rateLimitKey, bucket);
    }
    return false;
  };

  return {
    check(rateLimitKey, maxAttempts, windowMs = RATE_LIMIT_WINDOW_MS) {
      const currentTime = Date.now();
      if (currentTime - lastSweepAt >= RATE_LIMIT_SWEEP_INTERVAL_MS) sweep(currentTime);
      const bucket = buckets.get(rateLimitKey);
      if (bucket) {
        prune(bucket, currentTime);
        bucket.maxAttempts = maxAttempts;
        // Refresh insertion order so a full table drops the least recently
        // used bucket, not an account that is actively making calls.
        buckets.delete(rateLimitKey);
        buckets.set(rateLimitKey, bucket);
        if (isRefusing(bucket)) return false;
        bucket.attempts.push(currentTime);
        return true;
      }
      if (buckets.size >= maxKeys && currentTime - lastSweepAt >= RATE_LIMIT_FULL_SWEEP_INTERVAL_MS) sweep(currentTime);
      if (buckets.size >= maxKeys && !makeRoom(currentTime)) return true;
      buckets.set(rateLimitKey, { attempts: [currentTime], windowMs, maxAttempts });
      return true;
    },
    wouldAllow(rateLimitKey, maxAttempts) {
      const bucket = buckets.get(rateLimitKey);
      if (!bucket) return true;
      prune(bucket, Date.now());
      return bucket.attempts.length < maxAttempts;
    },
    size: () => buckets.size,
  };
}

/** Callers not signed in, keyed by network: sign-in pacing and invite-link previews. */
export const addressRateLimits = createRateLimiter(MAX_TRACKED_ADDRESS_KEYS);

/** Signed-in callers, keyed by account: per-RPC limits, phone pacing, receipt scans. */
export const accountRateLimits = createRateLimiter(MAX_TRACKED_ACCOUNT_KEYS);

/** The admin page: its sign-in per network, and its shared read and write budgets. */
export const adminRateLimits = createRateLimiter(MAX_TRACKED_ADMIN_KEYS);

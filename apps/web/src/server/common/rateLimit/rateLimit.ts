/** In-memory sliding-window rate limiter for brute-force and abuse protection. */

/** One bucket per key: timestamps (ms) of recent attempts, and the window they count in. */
interface Bucket {
  attempts: number[];
  /** Length of this bucket's window; buckets keyed for an hour keep an hour. */
  windowMs: number;
}

/** Default window: 1 minute. */
const WINDOW_MS = 60_000;

/** How often a request performs a full stale-bucket sweep. */
const SWEEP_INTERVAL_MS = 60_000;

/** Hard memory bound for distinct limiter keys retained by one process. */
export const MAX_TRACKED_RATE_LIMIT_KEYS = 10_000;

const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;

/** Removes attempt timestamps older than the bucket's window, in place. */
function prune(bucket: Bucket, currentTime: number): void {
  const cutoff = currentTime - bucket.windowMs;
  bucket.attempts = bucket.attempts.filter((timestamp) => timestamp >= cutoff);
}

/** Removes every bucket with no attempt remaining inside its window. */
function sweep(currentTime: number): void {
  for (const [rateLimitKey, bucket] of buckets) {
    prune(bucket, currentTime);
    if (bucket.attempts.length === 0) buckets.delete(rateLimitKey);
  }
  lastSweepAt = currentTime;
}

/**
 * Records an attempt for the given key and reports whether the limit has been
 * exceeded. Keys are caller-defined (e.g. `login:ip:1.2.3.4` or
 * `login:email:user@example.com`); a key that counts over a longer window
 * should say so in its name, since the first call fixes the bucket's window.
 * The limiter is in-process and per-instance; for multi-replica deployments
 * a shared store (Redis) would be needed.
 *
 * @param rateLimitKey - Identifier of the rate-limited actor (IP, email, …).
 * @param maxAttempts - Maximum attempts allowed within the rolling window.
 * @param windowMs - Length of the rolling window; one minute by default.
 * @returns True when the caller is within the limit (the attempt is allowed);
 *   false when the limit has been exceeded.
 */
export function rateLimitCheck(
  rateLimitKey: string,
  maxAttempts: number,
  windowMs: number = WINDOW_MS,
): boolean {
  const currentTime = Date.now();
  if (currentTime - lastSweepAt >= SWEEP_INTERVAL_MS) sweep(currentTime);
  const bucket = buckets.get(rateLimitKey);
  if (bucket) {
    prune(bucket, currentTime);
    // Refresh insertion order so the hard cap evicts the least-recently-used
    // bucket rather than an account that is actively making legitimate calls.
    buckets.delete(rateLimitKey);
    buckets.set(rateLimitKey, bucket);
    if (bucket.attempts.length >= maxAttempts) return false;
    bucket.attempts.push(currentTime);
    return true;
  }
  if (buckets.size >= MAX_TRACKED_RATE_LIMIT_KEYS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey !== undefined) buckets.delete(oldestKey);
  }
  buckets.set(rateLimitKey, { attempts: [currentTime], windowMs });
  return true;
}

/** Returns retained key count for health diagnostics and deterministic tests. */
export function trackedRateLimitKeyCount(): number {
  return buckets.size;
}

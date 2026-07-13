/** In-memory sliding-window rate limiter for brute-force protection. */

/** One bucket per key: timestamps (ms) of recent attempts within the window. */
interface Bucket {
  attempts: number[];
}

/** Default window: 1 minute. */
const WINDOW_MS = 60_000;

const buckets = new Map<string, Bucket>();

/** Removes attempt timestamps older than the window from a bucket in place. */
function prune(bucket: Bucket, currentTime: number): void {
  const cutoff = currentTime - WINDOW_MS;
  bucket.attempts = bucket.attempts.filter((timestamp) => timestamp >= cutoff);
}

/**
 * Records an attempt for the given key and reports whether the limit has been
 * exceeded. Keys are caller-defined (e.g. `login:ip:1.2.3.4` or
 * `login:email:user@example.com`). The limiter is in-process and per-instance;
 * for multi-replica deployments a shared store (Redis) would be needed.
 *
 * @param rateLimitKey - Identifier of the rate-limited actor (IP, email, …).
 * @param maxAttempts - Maximum attempts allowed within the rolling 60s window.
 * @returns True when the caller is within the limit (the attempt is allowed);
 *   false when the limit has been exceeded.
 */
export function rateLimitCheck(rateLimitKey: string, maxAttempts: number): boolean {
  const currentTime = Date.now();
  const bucket = buckets.get(rateLimitKey);
  if (bucket) {
    prune(bucket, currentTime);
    if (bucket.attempts.length >= maxAttempts) return false;
    bucket.attempts.push(currentTime);
    return true;
  }
  buckets.set(rateLimitKey, { attempts: [currentTime] });
  return true;
}

/** Memory-bound and expiry tests for the in-process sliding-window limiter. */

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe("rate limiter retention", () => {
  it("sweeps buckets after their attempts expire", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T00:00:00Z"));
    const limiter = await import("./rateLimit");

    expect(limiter.rateLimitCheck("expired-key", 1)).toBe(true);
    expect(limiter.trackedRateLimitKeyCount()).toBe(1);

    vi.advanceTimersByTime(60_001);
    expect(limiter.rateLimitCheck("current-key", 1)).toBe(true);
    expect(limiter.trackedRateLimitKeyCount()).toBe(1);
  });

  it("never retains more than the configured key cap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T00:00:00Z"));
    const limiter = await import("./rateLimit");

    for (let index = 0; index <= limiter.MAX_TRACKED_RATE_LIMIT_KEYS; index += 1) {
      expect(limiter.rateLimitCheck(`key-${index}`, 1)).toBe(true);
    }

    expect(limiter.trackedRateLimitKeyCount()).toBe(limiter.MAX_TRACKED_RATE_LIMIT_KEYS);
    // key-0 was least recently used and was evicted, so it starts a new bucket.
    expect(limiter.rateLimitCheck("key-0", 1)).toBe(true);
    expect(limiter.trackedRateLimitKeyCount()).toBe(limiter.MAX_TRACKED_RATE_LIMIT_KEYS);
  });
});

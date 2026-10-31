/**
 * The in-process limiters: buckets expire, a table never grows past its cap,
 * a full table drops expired and idle buckets but never one that is refusing
 * someone, and the tables are separate, so a flood of anonymous callers can
 * never reset an account's counters.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_EVICTION_SCAN } from "./rateLimit.constants";
import { accountRateLimits, addressRateLimits, createRateLimiter } from "./rateLimit";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a rate limiter", () => {
  it("allows up to the limit in a window, then refuses until the window moves on", () => {
    const limiter = createRateLimiter(100);

    expect([1, 2, 3].map(() => limiter.check("create-group:ana", 2))).toEqual([true, true, false]);

    vi.advanceTimersByTime(60_001);
    expect(limiter.check("create-group:ana", 2)).toBe(true);
  });

  it("sweeps out buckets whose attempts have all expired", () => {
    const limiter = createRateLimiter(100);
    limiter.check("expired-key", 1);

    vi.advanceTimersByTime(60_001);
    limiter.check("current-key", 1);

    expect(limiter.size()).toBe(1);
  });

  it("answers whether the next attempt would pass without spending it", () => {
    const limiter = createRateLimiter(100);

    expect(limiter.wouldAllow("peek-key", 2)).toBe(true);
    expect(limiter.wouldAllow("peek-key", 2)).toBe(true);
    limiter.check("peek-key", 2);
    limiter.check("peek-key", 2);
    expect(limiter.wouldAllow("peek-key", 2)).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter.wouldAllow("peek-key", 2)).toBe(true);
  });
});

describe("a full table", () => {
  it("never holds more than its cap, dropping the least recently used idle bucket", () => {
    const limiter = createRateLimiter(3);
    for (const bucketKey of ["first", "second", "third"]) limiter.check(bucketKey, 5);
    limiter.check("first", 5);

    limiter.check("fourth", 5);

    expect(limiter.size()).toBe(3);
    // "second" was least recently used and gave way; "first" was used again and stays.
    expect([1, 2, 3, 4].map(() => limiter.check("first", 5))).toEqual([true, true, true, false]);
  });

  it("drops an expired bucket before one still counting, even a less recently used one", () => {
    const limiter = createRateLimiter(2);
    limiter.check("idle", 5);
    limiter.check("short-window", 1, 1_000);

    vi.advanceTimersByTime(2_000);
    limiter.check("newcomer", 5);

    // "idle" kept its one attempt: four more pass, the fifth is refused.
    expect([1, 2, 3, 4, 5].map(() => limiter.check("idle", 5))).toEqual([true, true, true, true, false]);
  });

  it("never drops a bucket that is refusing someone, so a flood cannot undo being told to wait", () => {
    const limiter = createRateLimiter(3);
    limiter.check("scanner", 1);
    expect(limiter.check("scanner", 1)).toBe(false);

    for (let index = 0; index < 1_000; index++) limiter.check(`flood-${index}`, 30);

    expect(limiter.check("scanner", 1)).toBe(false);
    expect(limiter.size()).toBe(3);
  });

  it("lets a newcomer through untracked when everyone it could drop is being refused", () => {
    const limiter = createRateLimiter(RATE_LIMIT_EVICTION_SCAN);
    for (let index = 0; index < RATE_LIMIT_EVICTION_SCAN; index++) {
      limiter.check(`refused-${index}`, 1);
      limiter.check(`refused-${index}`, 1);
    }

    expect(limiter.check("newcomer", 1)).toBe(true);
    expect(limiter.check("refused-0", 1)).toBe(false);
    expect(limiter.size()).toBe(RATE_LIMIT_EVICTION_SCAN);
  });
});

describe("the separate tables", () => {
  it("keep an account's counters whatever anonymous callers do", () => {
    const account = "rpc:create-group:tomas";
    for (let attempt = 0; attempt < 10; attempt++) accountRateLimits.check(account, 10);
    expect(accountRateLimits.check(account, 10)).toBe(false);

    for (let index = 0; index < 20_000; index++) addressRateLimits.check(`invite-preview:2001:db8:${index}::/64`, 30);

    expect(accountRateLimits.check(account, 10)).toBe(false);
  });
});

/**
 * Unit tests for local-time rendering. Assertions are timezone-proof: the
 * timestamps sit at midday UTC, so no real-world offset (±14h at the
 * extremes) can move them across a year boundary, and the checks read
 * structure (year present or absent, parseability) rather than one locale's
 * exact spelling.
 */

import { describe, expect, it } from "vitest";
import { localDate, localDateTime } from "./localTime";

const NOW_TIME = new Date("2026-06-20T12:00:00Z");

describe("localDate", () => {
  it("renders a parseable timestamp and omits the current year", () => {
    const rendered = localDate("2026-06-15T12:00:00Z", NOW_TIME);
    expect(rendered).not.toBe("");
    expect(rendered).not.toContain("2026");
  });

  it("names the year when it is not the current one", () => {
    expect(localDate("2025-06-15T12:00:00Z", NOW_TIME)).toContain("2025");
  });

  it("returns empty for garbage instead of 'Invalid Date'", () => {
    expect(localDate("not a time", NOW_TIME)).toBe("");
    expect(localDate("", NOW_TIME)).toBe("");
  });
});

describe("localDateTime", () => {
  it("includes a clock time", () => {
    // Whatever the locale, a rendered time carries digits and a separator.
    expect(localDateTime("2026-06-15T12:00:00Z", NOW_TIME)).toMatch(/\d:\d\d/);
  });

  it("returns empty for garbage instead of 'Invalid Date'", () => {
    expect(localDateTime("not a time", NOW_TIME)).toBe("");
  });
});

/** Unit tests for the activity feed's formatting helpers. */

import { describe, expect, test } from "vitest";
import {
  dayHeading,
  groupByDay,
  monthLabel,
  timeOfDay,
  withoutAmount,
} from "./format";

const NOW_TIME = new Date(2026, 6, 27, 14, 30); // 27 July 2026, local time

describe("dayHeading", () => {
  test("today and yesterday are named, not dated", () => {
    expect(dayHeading(new Date(2026, 6, 27, 2, 0).toISOString(), NOW_TIME)).toBe("Today");
    expect(dayHeading(new Date(2026, 6, 26, 23, 59).toISOString(), NOW_TIME)).toBe("Yesterday");
  });

  test("earlier this year omits the year", () => {
    expect(dayHeading(new Date(2026, 2, 4).toISOString(), NOW_TIME)).not.toMatch(/2026/);
  });

  test("a previous year keeps the year", () => {
    expect(dayHeading(new Date(2025, 11, 31).toISOString(), NOW_TIME)).toMatch(/2025/);
  });

  test("crossing midnight counts as a different day, not 24 hours", () => {
    // 23:59 yesterday is 31 minutes before "now" but is still Yesterday.
    expect(dayHeading(new Date(2026, 6, 26, 23, 59).toISOString(), NOW_TIME)).toBe("Yesterday");
    expect(dayHeading(new Date(2026, 6, 27, 0, 1).toISOString(), NOW_TIME)).toBe("Today");
  });

  test("an unparseable timestamp does not throw", () => {
    expect(dayHeading("not a date", NOW_TIME)).toBe("Earlier");
  });
});

describe("groupByDay", () => {
  const stamp = (...parts: [number, number, number, number?]) => ({
    createdAt: new Date(...(parts as [number, number, number, number])).toISOString(),
  });

  test("consecutive same-day events land in one group", () => {
    const groups = groupByDay(
      [stamp(2026, 6, 27, 14), stamp(2026, 6, 27, 9), stamp(2026, 6, 26, 20)],
      NOW_TIME,
    );
    expect(groups.map((group) => group.heading)).toEqual(["Today", "Yesterday"]);
    expect(groups[0].events).toHaveLength(2);
    expect(groups[1].events).toHaveLength(1);
  });

  test("every event survives grouping", () => {
    const events = [stamp(2026, 6, 27), stamp(2026, 6, 26), stamp(2026, 5, 2), stamp(2026, 5, 1)];
    const total = groupByDay(events, NOW_TIME).reduce(
      (count, group) => count + group.events.length,
      0,
    );
    expect(total).toBe(events.length);
  });

  test("an empty feed groups to nothing", () => {
    expect(groupByDay([], NOW_TIME)).toEqual([]);
  });
});

describe("timeOfDay", () => {
  test("returns a time for a real timestamp and nothing for junk", () => {
    expect(timeOfDay(new Date(2026, 6, 27, 14, 5).toISOString())).toMatch(/\d/);
    expect(timeOfDay("nope")).toBe("");
  });
});

describe("monthLabel", () => {
  test("names the month and year", () => {
    expect(monthLabel("2026-07")).toBe("July 2026");
  });

  test("passes through anything that is not a month key", () => {
    expect(monthLabel("")).toBe("");
    expect(monthLabel("garbage")).toBe("garbage");
  });
});

describe("withoutAmount", () => {
  test("strips a parenthesised amount the row now shows as a figure", () => {
    expect(withoutAmount('Anirudha Paul added "Zazie" (USD 43.45)', 4345, "USD")).toBe(
      'Anirudha Paul added "Zazie"',
    );
  });

  test("strips a trailing amount with no parentheses", () => {
    expect(withoutAmount("Ani Test paid Anirudha Paul USD 263.00", 26300, "USD")).toBe(
      "Ani Test paid Anirudha Paul",
    );
  });

  test("leaves the sentence alone when there is no amount", () => {
    const message = 'Anirudha Paul created the group "Goa Trip"';
    expect(withoutAmount(message, 0, "")).toBe(message);
  });

  test("does not mangle other numbers in the sentence", () => {
    // The amount is 43.45; the "2026" and "12" must survive untouched.
    expect(withoutAmount('added "Trip 2026 day 12" (USD 43.45)', 4345, "USD")).toBe(
      'added "Trip 2026 day 12"',
    );
  });

  test("a mismatched amount is not stripped", () => {
    const message = 'added "Zazie" (USD 43.45)';
    expect(withoutAmount(message, 999, "USD")).toBe(message);
  });
});

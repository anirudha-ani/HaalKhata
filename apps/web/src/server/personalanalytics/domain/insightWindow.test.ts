/** Tests for the insights window: which months it covers and whose "this month" it believes. */

import { describe, expect, it } from "vitest";
import { clampInsightMonths, insightWindow, resolveCurrentMonth } from "./insightWindow";

describe("clampInsightMonths", () => {
  it("uses the default when the client asks for nothing", () => {
    expect(clampInsightMonths(0)).toBe(6);
  });

  it("uses the default for a negative or fractional size", () => {
    expect(clampInsightMonths(-3)).toBe(6);
    expect(clampInsightMonths(2.5)).toBe(6);
  });

  it("passes a size inside the bounds through", () => {
    expect(clampInsightMonths(1)).toBe(1);
    expect(clampInsightMonths(12)).toBe(12);
  });

  it("caps a window nobody could read as a chart", () => {
    expect(clampInsightMonths(600)).toBe(24);
  });
});

describe("resolveCurrentMonth", () => {
  it("uses the UTC month when the client sends nothing", () => {
    expect(resolveCurrentMonth("", new Date("2026-10-11T12:00:00Z"))).toBe("2026-10");
  });

  it("believes a client still in the previous month on the evening the UTC month turns", () => {
    // 9pm on 30 September in New York is already 1 October in UTC.
    expect(resolveCurrentMonth("2026-09", new Date("2026-10-01T01:00:00Z"))).toBe("2026-09");
  });

  it("believes a client already in the next month while UTC has not turned", () => {
    // 6am on 1 October in Auckland is still 30 September in UTC.
    expect(resolveCurrentMonth("2026-10", new Date("2026-09-30T17:00:00Z"))).toBe("2026-10");
  });

  it("ignores a month no timezone is in", () => {
    const midMonth = new Date("2026-10-11T12:00:00Z");
    expect(resolveCurrentMonth("2026-09", midMonth)).toBe("2026-10");
    expect(resolveCurrentMonth("2026-11", midMonth)).toBe("2026-10");
    expect(resolveCurrentMonth("1999-01", midMonth)).toBe("2026-10");
  });

  it("ignores a previous month once every timezone has left it", () => {
    // 13:00 UTC on the 1st: even UTC-12 is past midnight.
    expect(resolveCurrentMonth("2026-09", new Date("2026-10-01T13:00:00Z"))).toBe("2026-10");
  });

  it("ignores anything that is not a calendar month", () => {
    const nowTime = new Date("2026-10-01T01:00:00Z");
    expect(resolveCurrentMonth("2026-13", nowTime)).toBe("2026-10");
    expect(resolveCurrentMonth("2026-9", nowTime)).toBe("2026-10");
    expect(resolveCurrentMonth("'; DROP TABLE users; --", nowTime)).toBe("2026-10");
  });
});

describe("insightWindow", () => {
  it("covers whole months ending in the current one, oldest first", () => {
    const window = insightWindow(new Date("2026-10-11T12:00:00Z"), 3, "");
    expect(window.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(window.startDate).toBe("2026-08-01");
    expect(window.endDate).toBe("2026-11-01");
    expect(window.startInstant).toBe("2026-08-01T00:00:00.000Z");
  });

  it("crosses a year boundary without skipping or repeating a month", () => {
    const window = insightWindow(new Date("2027-02-03T00:00:00Z"), 6, "");
    expect(window.months).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(window.endDate).toBe("2027-03-01");
  });

  it("ends a December window on the first day of the next year", () => {
    const window = insightWindow(new Date("2026-12-15T00:00:00Z"), 1, "");
    expect(window.months).toEqual(["2026-12"]);
    expect(window.endDate).toBe("2027-01-01");
  });

  it("ends on the client's month when the client is believed", () => {
    const window = insightWindow(new Date("2026-10-01T01:00:00Z"), 2, "2026-09");
    expect(window.months).toEqual(["2026-08", "2026-09"]);
    expect(window.endDate).toBe("2026-10-01");
  });

  it("does not drift on the 31st, when adding a month to a date can skip one", () => {
    const window = insightWindow(new Date("2026-10-31T23:00:00Z"), 4, "2026-10");
    expect(window.months).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
  });
});

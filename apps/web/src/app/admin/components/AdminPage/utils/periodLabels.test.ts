/** Tests for the trend's day, axis, name and range labels. */

import { describe, expect, it } from "vitest";
import { TrendUnit } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { calendarDay } from "./calendarDay";
import { periodAxisLabel } from "./periodAxisLabel";
import { periodName } from "./periodName";
import { windowLabel } from "./windowLabel";

/** What the viewer's locale writes for a local day with the given options. */
function local(year: number, month: number, dayOfMonth: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(year, month - 1, dayOfMonth).toLocaleDateString(undefined, options);
}

describe("calendarDay", () => {
  it("reads the day that was written, whatever the timezone", () => {
    expect(calendarDay("2026-10-05")?.getDate()).toBe(5);
  });

  it("refuses anything that is not a day", () => {
    expect(calendarDay("soon")).toBeNull();
  });
});

describe("periodAxisLabel", () => {
  it("writes a week as its Monday", () => {
    expect(periodAxisLabel("2026-10-05", TrendUnit.WEEK)).toBe(local(2026, 10, 5, { day: "numeric", month: "short" }));
  });

  it("writes a month as its name, and a January with its year", () => {
    expect(periodAxisLabel("2026-10-01", TrendUnit.MONTH)).toBe(local(2026, 10, 1, { month: "short" }));
    expect(periodAxisLabel("2026-01-01", TrendUnit.MONTH)).toBe(local(2026, 1, 1, { month: "short", year: "numeric" }));
  });

  it("returns anything that is not a day untouched", () => {
    expect(periodAxisLabel("soon", TrendUnit.WEEK)).toBe("soon");
  });
});

describe("periodName", () => {
  it("names a week by its Monday and a month in full", () => {
    expect(periodName("2026-10-05", TrendUnit.WEEK)).toBe(`Week of ${local(2026, 10, 5, { day: "numeric", month: "short" })}`);
    expect(periodName("2026-10-01", TrendUnit.MONTH)).toBe(local(2026, 10, 1, { month: "long", year: "numeric" }));
  });
});

describe("windowLabel", () => {
  it("writes the year once for weeks inside one year", () => {
    expect(
      windowLabel([{ startOn: "2026-08-03", endOn: "2026-08-09" }, { startOn: "2026-10-19", endOn: "2026-10-25" }], TrendUnit.WEEK),
    ).toBe(`${local(2026, 8, 3, { day: "numeric", month: "short" })} to ${local(2026, 10, 25, { day: "numeric", month: "short", year: "numeric" })}`);
  });

  it("writes both years for weeks that cross one", () => {
    expect(
      windowLabel([{ startOn: "2025-12-01", endOn: "2025-12-07" }, { startOn: "2026-02-16", endOn: "2026-02-22" }], TrendUnit.WEEK),
    ).toContain(local(2025, 12, 1, { day: "numeric", month: "short", year: "numeric" }));
  });

  it("is empty with no periods", () => {
    expect(windowLabel([], TrendUnit.WEEK)).toBe("");
  });

  it("writes months as month and year at each end", () => {
    expect(
      windowLabel([{ startOn: "2025-11-01", endOn: "2025-11-30" }, { startOn: "2026-10-01", endOn: "2026-10-31" }], TrendUnit.MONTH),
    ).toBe(`${local(2025, 11, 1, { month: "short", year: "numeric" })} to ${local(2026, 10, 1, { month: "short", year: "numeric" })}`);
  });
});

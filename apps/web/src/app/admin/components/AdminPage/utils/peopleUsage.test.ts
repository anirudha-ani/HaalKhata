/** Tests for the admin people table helpers: counting by type, searching and stable ordering. */

import { describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import {
  UserUsageSchema,
  type UserUsage,
} from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { expenseCountOf, searchPeople, sortPeople, weekLabel } from "./peopleUsage";

/**
 * Builds one person's usage.
 *
 * @param name - Display name.
 * @param joinedOn - "YYYY-MM-DD".
 * @param bySplitType - Expenses added, keyed by split type.
 * @param paymentCount - Payments recorded.
 * @param receiptScanCount - Receipts scanned.
 * @returns The usage message.
 */
function person(
  name: string,
  joinedOn: string,
  bySplitType: Record<string, number> = {},
  paymentCount = 0,
  receiptScanCount = 0,
): UserUsage {
  return create(UserUsageSchema, {
    name,
    joinedOn,
    expensesBySplitType: Object.entries(bySplitType).map(([splitType, count]) => ({
      splitType,
      count,
    })),
    paymentCount,
    receiptScanCount,
  });
}

const ANIKA = person("Anika Rahman", "2026-09-01", { equal: 4, itemized: 2 }, 3, 5);
const RIFAT = person("Rifat Khan", "2026-10-02", { equal: 1 }, 0, 1);
const LATE = person("Late Comer", "2026-10-09");
const PEOPLE = [LATE, RIFAT, ANIKA];

describe("expenseCountOf", () => {
  it("adds every type when no type is chosen", () => {
    expect(expenseCountOf(ANIKA, "all")).toBe(6);
  });

  it("counts one type alone", () => {
    expect(expenseCountOf(ANIKA, "itemized")).toBe(2);
    expect(expenseCountOf(RIFAT, "itemized")).toBe(0);
  });

  it("is zero for someone who has added nothing", () => {
    expect(expenseCountOf(LATE, "all")).toBe(0);
  });
});

describe("searchPeople", () => {
  it("returns everyone for an empty search", () => {
    expect(searchPeople(PEOPLE, "  ")).toEqual(PEOPLE);
  });

  it("matches any part of the name, whatever the case", () => {
    expect(searchPeople(PEOPLE, "rah")).toEqual([ANIKA]);
    expect(searchPeople(PEOPLE, "KHAN")).toEqual([RIFAT]);
  });

  it("returns nobody when nothing matches", () => {
    expect(searchPeople(PEOPLE, "zebra")).toEqual([]);
  });
});

describe("sortPeople", () => {
  it("orders by expenses, most first", () => {
    expect(sortPeople(PEOPLE, "expenses", "descending", "all")).toEqual([ANIKA, RIFAT, LATE]);
  });

  it("orders the expenses column by the type it is showing", () => {
    const heavyEqual = person("Heavy Equal", "2026-08-01", { equal: 9 });
    expect(
      sortPeople([heavyEqual, ANIKA], "expenses", "descending", "itemized").map(
        (entry) => entry.name,
      ),
    ).toEqual(["Anika Rahman", "Heavy Equal"]);
  });

  it("orders by name and by the day joined", () => {
    expect(sortPeople(PEOPLE, "name", "ascending", "all")).toEqual([ANIKA, LATE, RIFAT]);
    expect(sortPeople(PEOPLE, "joined", "ascending", "all")).toEqual([ANIKA, RIFAT, LATE]);
    expect(sortPeople(PEOPLE, "joined", "descending", "all")).toEqual([LATE, RIFAT, ANIKA]);
  });

  it("orders by payments and by scans", () => {
    expect(sortPeople(PEOPLE, "payments", "descending", "all")[0]).toBe(ANIKA);
    expect(sortPeople(PEOPLE, "scans", "ascending", "all")).toEqual([LATE, RIFAT, ANIKA]);
  });

  it("keeps tied rows in the order they came in", () => {
    // Late and Rifat have no payments; they must not swap.
    expect(sortPeople(PEOPLE, "payments", "ascending", "all")).toEqual([LATE, RIFAT, ANIKA]);
    expect(sortPeople(PEOPLE, "payments", "descending", "all")).toEqual([ANIKA, LATE, RIFAT]);
  });

  it("does not reorder the list it was given", () => {
    const original = [...PEOPLE];
    sortPeople(PEOPLE, "name", "ascending", "all");
    expect(PEOPLE).toEqual(original);
  });
});

describe("weekLabel", () => {
  it("names the day that was written, whatever the timezone", () => {
    const expected = new Date(2026, 9, 5).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
    expect(weekLabel("2026-10-05")).toBe(expected);
  });

  it("returns anything that is not a day untouched", () => {
    expect(weekLabel("soon")).toBe("soon");
  });
});

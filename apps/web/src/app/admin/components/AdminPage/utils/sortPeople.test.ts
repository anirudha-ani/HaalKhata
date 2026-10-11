/** Tests for ordering the admin people list: every column, both directions, ties left alone. */

import { describe, expect, it } from "vitest";
import { ANIKA, LATECOMER, PEOPLE, personUsage, RIFAT } from "./peopleFixtures";
import { sortPeople } from "./sortPeople";

describe("sortPeople", () => {
  it("orders by expenses, most first", () => {
    expect(sortPeople(PEOPLE, "expenses", "descending", "all")).toEqual([ANIKA, RIFAT, LATECOMER]);
  });

  it("orders the expenses column by the type it is showing", () => {
    const heavyEqual = personUsage("Heavy Equal", "2026-08-01", { equal: 9 });
    expect(
      sortPeople([heavyEqual, ANIKA], "expenses", "descending", "itemized").map(
        (entry) => entry.name,
      ),
    ).toEqual(["Anika Rahman", "Heavy Equal"]);
  });

  it("orders by name and by the day joined", () => {
    expect(sortPeople(PEOPLE, "name", "ascending", "all")).toEqual([ANIKA, LATECOMER, RIFAT]);
    expect(sortPeople(PEOPLE, "joined", "ascending", "all")).toEqual([ANIKA, RIFAT, LATECOMER]);
    expect(sortPeople(PEOPLE, "joined", "descending", "all")).toEqual([LATECOMER, RIFAT, ANIKA]);
  });

  it("orders by payments and by scans", () => {
    expect(sortPeople(PEOPLE, "payments", "descending", "all")[0]).toBe(ANIKA);
    expect(sortPeople(PEOPLE, "scans", "ascending", "all")).toEqual([LATECOMER, RIFAT, ANIKA]);
  });

  it("keeps tied rows in the order they came in", () => {
    // The latecomer and Rifat have no payments; they must not swap.
    expect(sortPeople(PEOPLE, "payments", "ascending", "all")).toEqual([LATECOMER, RIFAT, ANIKA]);
    expect(sortPeople(PEOPLE, "payments", "descending", "all")).toEqual([ANIKA, LATECOMER, RIFAT]);
  });

  it("does not reorder the list it was given", () => {
    const original = [...PEOPLE];
    sortPeople(PEOPLE, "name", "ascending", "all");
    expect(PEOPLE).toEqual(original);
  });
});

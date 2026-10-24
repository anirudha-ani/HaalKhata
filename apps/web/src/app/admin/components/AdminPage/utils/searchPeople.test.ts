/** Tests for searching the admin people list by name. */

import { describe, expect, it } from "vitest";
import { ANIKA, PEOPLE, RIFAT } from "./peopleFixtures";
import { searchPeople } from "./searchPeople";

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

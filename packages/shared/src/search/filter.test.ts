/** Unit tests for the list-filter matcher. */

import { describe, expect, test } from "vitest";
import { matchesQuery, matchesTerms, searchTerms } from "./filter";

describe("searchTerms", () => {
  test("lowercases and splits on whitespace", () => {
    expect(searchTerms("  Ani   TEST ")).toEqual(["ani", "test"]);
  });

  test("a blank query has no terms", () => {
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("matchesTerms", () => {
  test("an empty query matches everything", () => {
    expect(matchesTerms([], "anything")).toBe(true);
  });

  test("matches terms in any order across fields", () => {
    expect(matchesQuery("test ani", "Ani Test", "ani@example.com")).toBe(true);
    expect(matchesQuery("ani test", "Ani Test")).toBe(true);
  });

  test("every term must match, not just one", () => {
    expect(matchesQuery("ani nope", "Ani Test")).toBe(false);
  });

  test("searches secondary fields like email", () => {
    expect(matchesQuery("example.com", "Ani Test", "ani@example.com")).toBe(true);
  });

  test("ignores undefined and empty fields", () => {
    expect(matchesQuery("ani", undefined, "", "Ani Test")).toBe(true);
    expect(matchesQuery("ani", undefined, "")).toBe(false);
  });

  test("digit terms match a phone number whatever its punctuation", () => {
    expect(matchesQuery("415 555", "Ani Test", "+1 (415) 555-2671")).toBe(true);
    expect(matchesQuery("4155552671", "Ani Test", "+1 (415) 555-2671")).toBe(true);
    expect(matchesQuery("999", "Ani Test", "+1 (415) 555-2671")).toBe(false);
  });

  test("a digit term still matches digits sitting inside a name", () => {
    expect(matchesQuery("2", "anirudha+test2", "")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(matchesQuery("ANI", "ani test")).toBe(true);
  });
});

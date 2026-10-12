/** Unit tests for removing characters a reader cannot see. */

import { describe, expect, test } from "vitest";
import { stripHiddenCharacters } from "./hiddenCharacters";

describe("stripHiddenCharacters", () => {
  test("plain text comes back untouched", () => {
    expect(stripHiddenCharacters("Chase checking 000123", false)).toBe("Chase checking 000123");
    expect(stripHiddenCharacters("", true)).toBe("");
  });

  test("a direction override no longer makes digits read one way and copy another", () => {
    expect(stripHiddenCharacters("123‮456789", false)).toBe("123456789");
    expect(stripHiddenCharacters("⁦123⁩", false)).toBe("123");
    expect(stripHiddenCharacters("Zelle ‮knab", true)).toBe("Zelle knab");
  });

  test("zero-width spaces, the byte-order mark, soft hyphens and word joiners go", () => {
    expect(stripHiddenCharacters("12345​6789", false)).toBe("123456789");
    expect(stripHiddenCharacters("﻿000123", false)).toBe("000123");
    expect(stripHiddenCharacters("jor­dan⁠lee", false)).toBe("jordanlee");
    expect(stripHiddenCharacters("a‎b‏c؜d", true)).toBe("abcd");
  });

  test("text made only of hidden characters becomes empty", () => {
    expect(stripHiddenCharacters("​​", true)).toBe("");
    expect(stripHiddenCharacters("‍", true)).toBe("");
    expect(stripHiddenCharacters("ㅤ⠀ᅟ", true)).toBe("");
  });

  test("a joiner between two letters of a script that uses joiners is kept in words", () => {
    // Bengali "ra + joiner + virama + ya", and Persian with a non-joiner.
    const bengali = "র‍্যাব";
    const persian = "می‌خواهم";
    expect(stripHiddenCharacters(bengali, true)).toBe(bengali);
    expect(stripHiddenCharacters(persian, true)).toBe(persian);
  });

  test("a joiner with nothing to join is removed even from words", () => {
    expect(stripHiddenCharacters("Zel‍le", true)).toBe("Zelle");
    expect(stripHiddenCharacters("‍র", true)).toBe("র");
    expect(stripHiddenCharacters("র‍", true)).toBe("র");
    expect(stripHiddenCharacters("র‍ য", true)).toBe("র য");
  });

  test("an identifier loses every joiner, whatever script it is in", () => {
    expect(stripHiddenCharacters("র‍্য", false)).toBe("র্য");
  });

  test("the Arabic number sign is drawn, so words keep it and identifiers do not", () => {
    expect(stripHiddenCharacters("\u0600\u0661\u0662", true)).toBe("\u0600\u0661\u0662");
    expect(stripHiddenCharacters("\u0600\u0661\u0662", false)).toBe("\u0661\u0662");
  });

  test("characters outside the basic plane survive whole", () => {
    expect(stripHiddenCharacters("pay \u{1F600}​ here", true)).toBe("pay \u{1F600} here");
  });
});

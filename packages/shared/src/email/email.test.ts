/** Tests for the shared email check: what it accepts, what it refuses, and that hostile text cannot stall it. */

import { describe, expect, it } from "vitest";
import { canonicalEmail, isEmailAddress } from "./email";
import {
  EMAIL_SHAPE_PATTERN,
  MAX_EMAIL_LENGTH,
  MAX_EMAIL_LOCAL_PART_LENGTH,
} from "./email.constants";

/** Largest request body any service accepts (receipt photos aside), in characters. */
const LARGEST_FIELD_LENGTH = 512 * 1024;

/** Time budget for refusing hostile text; the old pattern took seconds at a tenth of this size. */
const REFUSAL_BUDGET_MS = 100;

/**
 * Text built to make a backtracking email pattern try every way of splitting
 * it, each failing only at the last character.
 *
 * @param length - Roughly how many characters each one has.
 * @returns Named hostile inputs.
 */
function hostileInputs(length: number): Record<string, string> {
  return {
    "a run of dots between two @": `a@${".".repeat(length)}@`,
    "a run of labels with a bad ending": `a@${"a.".repeat(length / 2)} `,
    "a long local part with a bad ending": `${"a.".repeat(length / 2)}@a.com `,
    "a long domain with a bad ending": `${"a".repeat(length / 2)}@${"a".repeat(length / 2)} `,
    "a run of hyphens": `a@a${"-".repeat(length)}@`,
    "an unclosed quote": `"${"a".repeat(length)}@`,
  };
}

/**
 * Milliseconds a check takes on one input.
 *
 * @param check - The check to time.
 * @param input - Text to give it.
 * @returns Elapsed milliseconds.
 */
function timeCheck(check: (value: string) => unknown, input: string): number {
  const start = performance.now();
  check(input);
  return performance.now() - start;
}

describe("isEmailAddress", () => {
  it("accepts ordinary and unusual addresses people have", () => {
    for (const address of [
      "a@b.co",
      "jordan@example.com",
      "first.last+tag@mail.example.co.uk",
      "o'brien@example.ie",
      "bang!hash#@example.com",
      "José@münchen.de",
      "Upper.Case@Example.COM",
      "relay123@privaterelay.appleid.com",
    ]) {
      expect(isEmailAddress(address), address).toBe(true);
    }
  });

  it("refuses text that is not an address", () => {
    for (const text of [
      "",
      "plainaddress",
      "a@b",
      "@example.com",
      "jordan@",
      "jordan@@example.com",
      "jor@dan@example.com",
      "jor dan@example.com",
      "jordan@exa mple.com",
      "jordan@.example.com",
      "jordan@example..com",
      "jordan@example.com.",
    ]) {
      expect(isEmailAddress(text), JSON.stringify(text)).toBe(false);
    }
  });

  it("accepts the longest address the standard allows and refuses one character more", () => {
    /** An address of exactly `length` characters with a one-letter local part. */
    const addressOfLength = (length: number) => `a@${"d".repeat(length - 6)}.com`;
    expect(addressOfLength(MAX_EMAIL_LENGTH)).toHaveLength(MAX_EMAIL_LENGTH);
    expect(isEmailAddress(addressOfLength(MAX_EMAIL_LENGTH))).toBe(true);
    expect(isEmailAddress(addressOfLength(MAX_EMAIL_LENGTH + 1))).toBe(false);
  });

  it("accepts the longest part before the @ and refuses one character more", () => {
    expect(isEmailAddress(`${"a".repeat(MAX_EMAIL_LOCAL_PART_LENGTH)}@example.com`)).toBe(true);
    expect(isEmailAddress(`${"a".repeat(MAX_EMAIL_LOCAL_PART_LENGTH + 1)}@example.com`)).toBe(false);
  });

  it("refuses the largest hostile field any request can carry at once", () => {
    for (const [name, input] of Object.entries(hostileInputs(LARGEST_FIELD_LENGTH))) {
      expect(isEmailAddress(input), name).toBe(false);
      expect(timeCheck(isEmailAddress, input), name).toBeLessThan(REFUSAL_BUDGET_MS);
    }
  });
});

describe("EMAIL_SHAPE_PATTERN", () => {
  it("takes time that grows with the text, not its square, even without the length limit", () => {
    for (const [name, input] of Object.entries(hostileInputs(100_000))) {
      expect(EMAIL_SHAPE_PATTERN.test(input), name).toBe(false);
      expect(timeCheck((value) => EMAIL_SHAPE_PATTERN.test(value), input), name).toBeLessThan(REFUSAL_BUDGET_MS);
    }
  });
});

describe("canonicalEmail", () => {
  it("trims and lower-cases an address", () => {
    expect(canonicalEmail("  Rifat@Example.COM \n")).toBe("rifat@example.com");
  });

  it("returns null for text that is not an address", () => {
    expect(canonicalEmail("rifat at example")).toBeNull();
    expect(canonicalEmail("   ")).toBeNull();
  });

  it("measures the address after trimming, so surrounding spaces do not count", () => {
    const address = `${"a".repeat(MAX_EMAIL_LOCAL_PART_LENGTH)}@example.com`;
    expect(canonicalEmail(`   ${address}   `)).toBe(address);
  });
});

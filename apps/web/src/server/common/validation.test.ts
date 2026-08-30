/** Tests for shared persisted-value validation. */

import { describe, expect, it } from "vitest";
import { normalizeCurrencyCode } from "./validation";

describe("normalizeCurrencyCode", () => {
  it("normalizes valid three-letter codes", () => {
    expect(normalizeCurrencyCode(" usd ")).toBe("USD");
  });

  it.each(["", "US", "USDD", "U$D", "１２３"])('rejects invalid currency code "%s"', (value) => {
    expect(() => normalizeCurrencyCode(value)).toThrow(/three-letter code/);
  });

  it("rejects a well-formed code the product does not support", () => {
    // Shape alone let ZZZ through, and with it a balance nobody could settle.
    expect(() => normalizeCurrencyCode("ZZZ")).toThrow(/not supported/);
  });
});

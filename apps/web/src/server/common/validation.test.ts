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
});

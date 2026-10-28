/** A BIGINT reaches the app as the exact number it holds, or not at all. */

import { describe, expect, it } from "vitest";
import { parseExactInt8 } from "./int8";

describe("parseExactInt8", () => {
  it("reads money and sums as exact numbers", () => {
    expect(parseExactInt8("0")).toBe(0);
    expect(parseExactInt8("10000000000000")).toBe(10_000_000_000_000);
    expect(parseExactInt8("-2500000000000")).toBe(-2_500_000_000_000);
    expect(parseExactInt8("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("refuses a value a number would round, instead of showing it wrong", () => {
    expect(() => parseExactInt8("9007199254740993")).toThrow(RangeError);
    expect(() => parseExactInt8("-9007199254740992")).toThrow(RangeError);
    expect(() => parseExactInt8("9223372036854775807")).toThrow(RangeError);
  });
});

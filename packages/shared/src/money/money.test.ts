/** Unit tests for the cents-based money parsing/formatting helpers. */

import { describe, expect, it } from "vitest";
import { centsToInput, parseMoneyInput } from "./money";

describe("parseMoneyInput", () => {
  it("parses plain and decimal amounts to cents", () => {
    expect(parseMoneyInput("12")).toBe(1200);
    expect(parseMoneyInput("12.5")).toBe(1250);
    expect(parseMoneyInput("12.50")).toBe(1250);
    expect(parseMoneyInput("0.01")).toBe(1);
  });

  it("accepts a comma as the decimal separator", () => {
    expect(parseMoneyInput("12,50")).toBe(1250);
  });

  it("rejects empty and malformed input", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("  ")).toBeNull();
    expect(parseMoneyInput("12.345")).toBeNull();
    expect(parseMoneyInput("-5")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });
});

describe("centsToInput", () => {
  it("round-trips with parseMoneyInput", () => {
    for (const cents of [0, 1, 99, 100, 1250, 99999]) {
      expect(parseMoneyInput(centsToInput(cents))).toBe(cents);
    }
  });
});

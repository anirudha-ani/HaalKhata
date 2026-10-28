/** Unit tests for the cents-based money parsing/formatting helpers. */

import { describe, expect, it } from "vitest";
import { centsToInput, formatMoney, parseMoneyInput } from "./money";
import { CURRENCIES, currencyInfo } from "./money.constants";

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

describe("parseMoneyInput at scale", () => {
  it("reads large amounts digit for digit, with no float rounding", () => {
    expect(parseMoneyInput("100000000000.00")).toBe(10_000_000_000_000);
    expect(parseMoneyInput("123456789012.34")).toBe(12_345_678_901_234);
    expect(parseMoneyInput("25000000", "IDR")).toBe(2_500_000_000);
    expect(parseMoneyInput("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("refuses an amount too long to hold exactly", () => {
    expect(parseMoneyInput("90071992547409.92")).toBeNull();
    expect(parseMoneyInput("99999999999999999999")).toBeNull();
  });
});

describe("centsToInput", () => {
  it("round-trips with parseMoneyInput", () => {
    for (const cents of [0, 1, 99, 100, 1250, 99999]) {
      expect(parseMoneyInput(centsToInput(cents))).toBe(cents);
    }
  });

  it("writes large and negative amounts exactly", () => {
    expect(centsToInput(12_345_678_901_234)).toBe("123456789012.34");
    expect(centsToInput(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
    expect(centsToInput(-1250)).toBe("-12.50");
    expect(centsToInput(-5)).toBe("-0.05");
    expect(centsToInput(10_000_000_000_000, "JPY")).toBe("10000000000000");
    expect(centsToInput(1_000_000_000_001, "KWD")).toBe("1000000000.001");
    for (const cents of [10_000_000_000_000, 12_345_678_901_234, Number.MAX_SAFE_INTEGER]) {
      expect(parseMoneyInput(centsToInput(cents))).toBe(cents);
    }
  });
});

describe("minor-unit awareness (§36)", () => {
  it("parses with the currency's own decimals", () => {
    // JPY has no minor unit: whole numbers only, stored as typed.
    expect(parseMoneyInput("1250", "JPY")).toBe(1250);
    expect(parseMoneyInput("12.50", "JPY")).toBeNull();
    // KWD carries three: one dinar is 1000 fils.
    expect(parseMoneyInput("1.250", "KWD")).toBe(1250);
    expect(parseMoneyInput("1.2505", "KWD")).toBeNull();
  });

  it("round-trips inputs in 0- and 3-digit currencies", () => {
    for (const cents of [1, 999, 1250, 99999]) {
      expect(parseMoneyInput(centsToInput(cents, "JPY"), "JPY")).toBe(cents);
      expect(parseMoneyInput(centsToInput(cents, "KWD"), "KWD")).toBe(cents);
    }
  });

  it("formats without inventing or dropping precision", () => {
    // 1250 stored in JPY is ¥1,250, not ¥12.50 rounded to ¥13.
    expect(formatMoney(1250, "JPY")).toMatch(/1,?250/);
    expect(formatMoney(1250, "JPY")).not.toMatch(/12\.5/);
    expect(formatMoney(1250, "KWD")).toMatch(/1\.250/);
  });
});

describe("currency catalog", () => {
  it("offers the full transactional ISO list with symbols and digits", () => {
    expect(CURRENCIES.length).toBeGreaterThan(140);
    expect(CURRENCIES[0]?.code).toBe("USD");
    expect(currencyInfo("BDT")).toMatchObject({ symbol: "৳", digits: 2 });
    expect(currencyInfo("JPY")?.digits).toBe(0);
    expect(currencyInfo("KWD")?.digits).toBe(3);
    // Gold and the test code are ISO rows but not money anyone can owe.
    expect(currencyInfo("XAU")).toBeUndefined();
    expect(currencyInfo("XTS")).toBeUndefined();
  });
});

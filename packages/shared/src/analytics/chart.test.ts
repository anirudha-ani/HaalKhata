/** Tests for chart geometry: ceilings that are round, fractions that stay in range, labels that keep the newest bar. */

import { describe, expect, it } from "vitest";
import {
  barFraction,
  compactMoney,
  compactNumber,
  countCeiling,
  moneyCeiling,
  niceCeiling,
  showsAxisLabel,
} from "./chart";

describe("niceCeiling", () => {
  it("rounds up to the next round step", () => {
    expect(niceCeiling(1)).toBe(1);
    expect(niceCeiling(1.3)).toBe(1.5);
    expect(niceCeiling(2.2)).toBe(3);
    expect(niceCeiling(41)).toBe(50);
    expect(niceCeiling(63)).toBe(80);
    expect(niceCeiling(412)).toBe(500);
    expect(niceCeiling(1071)).toBe(1200);
    expect(niceCeiling(2400)).toBe(3000);
  });

  it("never leaves the tallest bar stranded in the bottom of the plot", () => {
    for (const maximum of [1, 7, 13, 49, 101, 1071, 2501, 9999, 123456]) {
      const ceiling = niceCeiling(maximum);
      expect(ceiling).toBeGreaterThanOrEqual(maximum);
      expect(maximum / ceiling).toBeGreaterThan(0.6);
    }
  });

  it("ends on a number whose half a tick label can show exactly", () => {
    for (const maximum of [1, 7, 13, 49, 101, 1071, 2501, 9999, 123456]) {
      const half = niceCeiling(maximum) / 2;
      expect(Math.round(half * 100) / 100).toBe(half);
    }
  });

  it("keeps a value that is already round", () => {
    expect(niceCeiling(500)).toBe(500);
    expect(niceCeiling(0.5)).toBe(0.5);
  });

  it("is not thrown off by float noise in the scaling", () => {
    // 0.6 / 0.1 and 0.2 / 0.1 do not divide exactly; each must still land on
    // its own step rather than being pushed to the next one up.
    expect(niceCeiling(0.6)).toBeCloseTo(0.6);
    expect(niceCeiling(0.2)).toBeCloseTo(0.2);
    expect(niceCeiling(0.7)).toBeCloseTo(0.8);
  });

  it("gives an empty chart an axis rather than a division by zero", () => {
    expect(niceCeiling(0)).toBe(1);
    expect(niceCeiling(-5)).toBe(1);
    expect(niceCeiling(Number.NaN)).toBe(1);
  });
});

describe("countCeiling", () => {
  it("always has a whole-number halfway line", () => {
    for (const maximum of [0, 1, 2, 3, 5, 7, 9, 10, 11, 25, 45, 99, 100, 250, 1000]) {
      const ceiling = countCeiling(maximum);
      expect(ceiling).toBeGreaterThanOrEqual(Math.max(maximum, 2));
      expect(Number.isInteger(ceiling / 2)).toBe(true);
    }
  });

  it("picks the nearest even step", () => {
    expect(countCeiling(1)).toBe(2);
    expect(countCeiling(3)).toBe(4);
    expect(countCeiling(9)).toBe(10);
    expect(countCeiling(11)).toBe(20);
    expect(countCeiling(45)).toBe(60);
  });

  it("ends on a round ten, hundred or thousand that is itself the busiest bar", () => {
    expect(countCeiling(10)).toBe(10);
    expect(countCeiling(100)).toBe(100);
    expect(countCeiling(1000)).toBe(1000);
  });
});

describe("moneyCeiling", () => {
  it("rounds in major units for a two-decimal currency", () => {
    expect(moneyCeiling(41250, "USD")).toBe(50000);
    expect(moneyCeiling(230, "USD")).toBe(300);
  });

  it("treats a zero-decimal currency's minor unit as the major one", () => {
    expect(moneyCeiling(27000, "JPY")).toBe(30000);
  });

  it("handles a three-decimal currency", () => {
    expect(moneyCeiling(41250, "KWD")).toBe(50000);
  });

  it("gives an empty chart one major unit of axis", () => {
    expect(moneyCeiling(0, "USD")).toBe(100);
  });
});

describe("barFraction", () => {
  it("is the value's share of the ceiling", () => {
    expect(barFraction(250, 500)).toBe(0.5);
    expect(barFraction(500, 500)).toBe(1);
  });

  it("never leaves the 0 to 1 range", () => {
    expect(barFraction(900, 500)).toBe(1);
    expect(barFraction(-10, 500)).toBe(0);
  });

  it("draws nothing rather than dividing by a missing ceiling", () => {
    expect(barFraction(10, 0)).toBe(0);
    expect(barFraction(Number.NaN, 10)).toBe(0);
  });
});

describe("showsAxisLabel", () => {
  it("labels every bar when they all fit", () => {
    expect([0, 1, 2, 3, 4, 5].map((index) => showsAxisLabel(index, 6, 6))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("thins from the newest bar back, so the rightmost label always shows", () => {
    const shown = Array.from({ length: 12 }, (_unused, index) => showsAxisLabel(index, 12, 6));
    expect(shown[11]).toBe(true);
    expect(shown.filter(Boolean)).toHaveLength(6);
    expect(shown).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
  });

  it("copes with a label budget of zero", () => {
    expect(showsAxisLabel(2, 3, 0)).toBe(true);
  });
});

describe("compactNumber", () => {
  it("leaves small numbers alone", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(250)).toBe("250");
    expect(compactNumber(2.5)).toBe("2.5");
    expect(compactNumber(0.75)).toBe("0.75");
  });

  it("shortens thousands, millions and billions without a trailing zero", () => {
    expect(compactNumber(1000)).toBe("1K");
    expect(compactNumber(2500)).toBe("2.5K");
    expect(compactNumber(1250)).toBe("1.25K");
    expect(compactNumber(30000)).toBe("30K");
    expect(compactNumber(4_500_000)).toBe("4.5M");
    expect(compactNumber(2_000_000_000)).toBe("2B");
  });
});

describe("compactMoney", () => {
  it("puts the currency symbol on a compact major-unit amount", () => {
    expect(compactMoney(50000, "USD")).toBe("$500");
    expect(compactMoney(250000, "USD")).toBe("$2.5K");
  });

  it("respects the currency's minor unit", () => {
    expect(compactMoney(30000, "JPY")).toBe("¥30K");
  });

  it("falls back to the code for a currency it has no symbol for", () => {
    expect(compactMoney(50000, "ZZZ")).toBe("ZZZ500");
  });
});

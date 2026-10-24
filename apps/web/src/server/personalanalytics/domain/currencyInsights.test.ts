/** Tests for assembling per-currency insights: zero-filled months, ordering, and currencies kept apart. */

import { describe, expect, it } from "vitest";
import { assembleCurrencyInsights } from "./currencyInsights";

const MONTHS = ["2026-08", "2026-09", "2026-10"];

describe("assembleCurrencyInsights", () => {
  it("returns nothing for a window with no activity", () => {
    expect(assembleCurrencyInsights(MONTHS, "USD", [], [], [])).toEqual([]);
  });

  it("lays a currency's months out against the window, zeros included", () => {
    const [block] = assembleCurrencyInsights(
      MONTHS,
      "USD",
      [
        { currency: "USD", month: "2026-10", shareCents: 4000, paidCents: 9000 },
        { currency: "USD", month: "2026-08", shareCents: 1500, paidCents: 0 },
      ],
      [],
      [],
    );

    expect(block.monthlyShareCents).toEqual([1500, 0, 4000]);
    expect(block.shareCents).toBe(5500);
    expect(block.paidCents).toBe(9000);
  });

  it("never adds one currency into another", () => {
    const blocks = assembleCurrencyInsights(
      MONTHS,
      "USD",
      [
        { currency: "USD", month: "2026-10", shareCents: 1000, paidCents: 1000 },
        { currency: "EUR", month: "2026-10", shareCents: 700, paidCents: 0 },
      ],
      [],
      [],
    );

    expect(blocks.map((block) => [block.currency, block.shareCents])).toEqual([
      ["USD", 1000],
      ["EUR", 700],
    ]);
  });

  it("lists the default currency first even when another has more spending", () => {
    const blocks = assembleCurrencyInsights(
      MONTHS,
      "USD",
      [
        { currency: "BDT", month: "2026-10", shareCents: 900000, paidCents: 0 },
        { currency: "EUR", month: "2026-10", shareCents: 5000, paidCents: 0 },
        { currency: "USD", month: "2026-10", shareCents: 100, paidCents: 0 },
      ],
      [],
      [],
    );

    expect(blocks.map((block) => block.currency)).toEqual(["USD", "BDT", "EUR"]);
  });

  it("orders the remaining currencies by spending, then by code", () => {
    const blocks = assembleCurrencyInsights(
      MONTHS,
      "USD",
      [
        { currency: "GBP", month: "2026-10", shareCents: 500, paidCents: 0 },
        { currency: "EUR", month: "2026-10", shareCents: 500, paidCents: 0 },
        { currency: "JPY", month: "2026-10", shareCents: 9000, paidCents: 0 },
      ],
      [],
      [],
    );

    expect(blocks.map((block) => block.currency)).toEqual(["JPY", "EUR", "GBP"]);
  });

  it("sorts categories largest first within their own currency", () => {
    const [block] = assembleCurrencyInsights(
      MONTHS,
      "USD",
      [{ currency: "USD", month: "2026-10", shareCents: 6000, paidCents: 0 }],
      [
        { currency: "USD", category: "travel", shareCents: 1000 },
        { currency: "USD", category: "food", shareCents: 4000 },
        { currency: "USD", category: "general", shareCents: 1000 },
        { currency: "EUR", category: "food", shareCents: 99999 },
      ],
      [],
    );

    expect(block.categories.map((category) => category.category)).toEqual([
      "food",
      "general",
      "travel",
    ]);
  });

  it("shows a currency someone only settled in, with no spending", () => {
    const blocks = assembleCurrencyInsights(
      MONTHS,
      "USD",
      [],
      [],
      [{ currency: "EUR", paidCents: 2500, receivedCents: 400 }],
    );

    expect(blocks).toEqual([
      {
        currency: "EUR",
        shareCents: 0,
        paidCents: 0,
        monthlyShareCents: [0, 0, 0],
        categories: [],
        settledOutCents: 2500,
        settledInCents: 400,
      },
    ]);
  });

  it("drops a row for a month outside the window instead of misfiling it", () => {
    const [block] = assembleCurrencyInsights(
      MONTHS,
      "USD",
      [
        { currency: "USD", month: "2026-07", shareCents: 9999, paidCents: 9999 },
        { currency: "USD", month: "2026-09", shareCents: 100, paidCents: 0 },
      ],
      [],
      [],
    );

    expect(block.monthlyShareCents).toEqual([0, 100, 0]);
    expect(block.shareCents).toBe(100);
  });
});

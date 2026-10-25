/** Tests for the spending chart's columns: aligned with the window, labelled, and under a round ceiling. */

import { describe, expect, it } from "vitest";
import { formatMoney } from "../money/money";
import { spendingColumns } from "./spendingChart";

const MONTHS = ["2026-08", "2026-09", "2026-10"];

describe("spendingColumns", () => {
  it("makes one column per month of the window, in order", () => {
    const { columns } = spendingColumns(MONTHS, [1500, 0, 41250], "USD");

    expect(columns.map((column) => column.key)).toEqual(MONTHS);
    expect(columns.map((column) => column.value)).toEqual([1500, 0, 41250]);
    expect(columns[2].valueLabel).toBe(formatMoney(41250, "USD"));
  });

  it("ends the axis on a round amount at or above the tallest month", () => {
    expect(spendingColumns(MONTHS, [1500, 0, 41250], "USD").ceiling).toBe(50000);
  });

  it("draws a month the amounts list is missing as zero instead of dropping it", () => {
    const { columns } = spendingColumns(MONTHS, [700], "USD");

    expect(columns).toHaveLength(3);
    expect(columns.map((column) => column.value)).toEqual([700, 0, 0]);
  });

  it("gives an empty window an axis rather than a division by zero", () => {
    const { columns, ceiling } = spendingColumns(MONTHS, [0, 0, 0], "USD");

    expect(columns.every((column) => column.value === 0)).toBe(true);
    expect(ceiling).toBeGreaterThan(0);
  });

  it("returns no columns for no months", () => {
    expect(spendingColumns([], [], "USD").columns).toEqual([]);
  });
});

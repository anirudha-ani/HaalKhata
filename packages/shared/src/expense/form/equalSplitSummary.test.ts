/** Currency and indivisible-total regression cases for both expense editors. */
import { describe, expect, it } from "vitest";
import { equalSplitSummary } from "./equalSplitSummary";
import { formatMoney } from "../../money/money";

describe("equalSplitSummary", () => {
  it.each([[1200, 3, "USD"], [1200, 3, "JPY"], [1200, 3, "KWD"]])(
    "uses the minor units for %s across %s people in %s", (total, people, currency) => {
      expect(equalSplitSummary(total, people, currency)).toBe(`${formatMoney(total / people, currency)} each · 3 people`);
    },
  );
  it("shows both actual shares instead of implying every person owes a rounded average", () => {
    expect(equalSplitSummary(1000, 3, "USD")).toBe(`${formatMoney(333, "USD")}–${formatMoney(334, "USD")} each · 3 people`);
  });
  it("keeps remainder units visible in zero-decimal currencies", () => {
    expect(equalSplitSummary(1001, 2, "JPY")).toBe(`${formatMoney(500, "JPY")}–${formatMoney(501, "JPY")} each · 2 people`);
  });
  it("handles a single participant and totals smaller than the participant count", () => {
    expect(equalSplitSummary(1, 1, "USD")).toBe(`${formatMoney(1, "USD")} each · 1 person`);
    expect(equalSplitSummary(1, 3, "USD")).toBe(`${formatMoney(0, "USD")}–${formatMoney(1, "USD")} each · 3 people`);
  });
  it.each([[0, 2], [100, 0], [-1, 2], [1.5, 2], [100, 1.5], [Infinity, 2]])("omits invalid or incomplete input %s/%s", (total, people) => {
    expect(equalSplitSummary(total, people, "USD")).toBe("");
  });
});

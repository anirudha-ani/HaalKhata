/** Editing ratio splits preserves saved money without guessing inputs lost by persistence. */
import { expect, it } from "vitest";
import { restoreExpenseSplit } from "./restoreSplit";
import { buildSplitSpecs, checkSplit, previewSplitShares } from "./splitForm";

it.each(["percent", "shares"])("restores %s edits with valid, exact saved allocations", (splitType) => {
  const splits = [{ userId: "alice", owedCents: 333 }, { userId: "bob", owedCents: 668 }];
  const restored = restoreExpenseSplit(splitType, splits, "JPY");
  const input = { ...restored, totalCents: 1001, participantIds: ["alice", "bob"], inputs: restored.splitInputs, currency: "JPY" };
  expect(restored.splitType).toBe("exact");
  expect(restored.splitNotice).toContain("Amounts");
  expect(checkSplit(input).ok).toBe(true);
  expect(buildSplitSpecs(input).map((split) => split.amountCents)).toEqual([333, 668]);
  expect(previewSplitShares(input)).toEqual({ alice: 333, bob: 668 });
});

it.each(["equal", "exact", "itemized"])("leaves %s mode unchanged", (splitType) => {
  const restored = restoreExpenseSplit(splitType, [{ userId: "alice", owedCents: 333 }], "KWD");
  expect(restored.splitType).toBe(splitType);
  expect(restored.splitNotice).toBe("");
  expect(restored.splitInputs).toEqual(splitType === "exact" ? { alice: "0.333" } : {});
});

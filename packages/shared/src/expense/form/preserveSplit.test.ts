/** Historical ratio types survive only allocation-preserving edits. */
import { expect, it } from "vitest";
import { canPreserveSplitType, type SplitSnapshot } from "./preserveSplit";

const saved: SplitSnapshot = { splitType: "percent", amountCents: 1001, currency: "JPY", groupId: "group",
  splits: [{ userId: "alice", owedCents: 333 }, { userId: "friend", owedCents: 668 }] };
const draft = { ...saved, splitType: "exact" };

it.each(["percent", "shares"])("preserves %s for unchanged amounts, independent of row order", (splitType) => {
  expect(canPreserveSplitType({ ...saved, splitType }, { ...draft, splits: [...draft.splits].reverse() })).toBe(true);
});
it.each([
  { amountCents: 1002 }, { currency: "USD" }, { groupId: "other" }, { splitType: "shares" },
  { splits: [{ userId: "alice", owedCents: 334 }, { userId: "friend", owedCents: 667 }] },
  { splits: [{ userId: "alice", owedCents: 333 }, { userId: "alice", owedCents: 333 }] },
  { splits: [] },
])("rejects changed financial snapshot %j", (changes) => {
  expect(canPreserveSplitType(saved, { ...draft, ...changes })).toBe(false);
});
it("does not infer ratio modes for new or already-exact expenses", () => {
  expect(canPreserveSplitType(undefined, draft)).toBe(false);
  expect(canPreserveSplitType(draft, draft)).toBe(false);
});

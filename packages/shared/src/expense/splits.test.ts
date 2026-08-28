/** Unit tests for the pure split math: allocate, equal/exact/percent/shares, itemized receipts. */

import { describe, expect, it } from "vitest";
import { allocate } from "./allocate";
import { SplitError, computeItemizedSplits, computeSplits, itemShareCents } from "./splits";

const sumOwedCents = (splits: { owedCents: number }[]) =>
  splits.reduce((runningTotal, split) => runningTotal + split.owedCents, 0);

describe("allocate", () => {
  it("sums exactly to the total for awkward divisions", () => {
    for (const totalCents of [1, 2, 10, 99, 100, 101, 333, 1000, 99999]) {
      for (const participantCount of [1, 2, 3, 4, 7, 11]) {
        const result = allocate(totalCents, Array(participantCount).fill(1));
        expect(result.reduce((runningTotal, cents) => runningTotal + cents, 0)).toBe(totalCents);
      }
    }
  });

  it("distributes the remainder deterministically", () => {
    expect(allocate(100, [1, 1, 1])).toEqual(allocate(100, [1, 1, 1]));
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("is proportional to weights", () => {
    expect(allocate(300, [2, 1])).toEqual([200, 100]);
  });

  it("falls back to an equal split when all weights are zero", () => {
    expect(allocate(90, [0, 0, 0])).toEqual([30, 30, 30]);
  });
});

describe("computeSplits", () => {
  const users = (count: number) =>
    Array.from({ length: count }, (_unused, index) => ({ userId: `u${index}` }));

  it("equal: reconciles to the total with remainder cents", () => {
    const splits = computeSplits("equal", 1000, users(3));
    expect(sumOwedCents(splits)).toBe(1000);
    expect(splits.map((split) => split.owedCents).sort()).toEqual([333, 333, 334]);
  });

  it("exact: accepts only amounts summing to the total", () => {
    const validSplits = computeSplits("exact", 500, [
      { userId: "a", amountCents: 300 },
      { userId: "b", amountCents: 200 },
    ]);
    expect(sumOwedCents(validSplits)).toBe(500);
    expect(() =>
      computeSplits("exact", 500, [
        { userId: "a", amountCents: 300 },
        { userId: "b", amountCents: 100 },
      ]),
    ).toThrow(SplitError);
  });

  it("percent: requires 10000 basis points and reconciles", () => {
    const splits = computeSplits("percent", 999, [
      { userId: "a", percentBp: 3333 },
      { userId: "b", percentBp: 3333 },
      { userId: "c", percentBp: 3334 },
    ]);
    expect(sumOwedCents(splits)).toBe(999);
    expect(() =>
      computeSplits("percent", 999, [
        { userId: "a", percentBp: 5000 },
        { userId: "b", percentBp: 4000 },
      ]),
    ).toThrow(SplitError);
  });

  it("percent: rejects negative basis points even when the total is 100%", () => {
    expect(() =>
      computeSplits("percent", 1000, [
        { userId: "a", percentBp: -10000 },
        { userId: "b", percentBp: 20000 },
      ]),
    ).toThrowError(new SplitError("percentages must be non-negative"));
  });

  it("shares: proportional and exact", () => {
    const splits = computeSplits("shares", 700, [
      { userId: "a", shares: 2 },
      { userId: "b", shares: 5 },
    ]);
    expect(sumOwedCents(splits)).toBe(700);
    expect(splits.find((split) => split.userId === "a")!.owedCents).toBe(200);
  });

  it("rejects duplicate participants", () => {
    expect(() => computeSplits("equal", 100, [{ userId: "a" }, { userId: "a" }])).toThrow(
      SplitError,
    );
  });
});

describe("computeItemizedSplits", () => {
  it("assigns items and splits tax+tip proportionally, reconciling exactly", () => {
    const { splits, totalCents } = computeItemizedSplits(
      [
        { name: "pizza", totalCents: 1450, assignments: [{ userId: "a", weight: 1 }] },
        {
          name: "burger",
          totalCents: 1990,
          assignments: [
            { userId: "a", weight: 1 },
            { userId: "b", weight: 1 },
          ],
        },
      ],
      419,
      800,
    );
    expect(totalCents).toBe(1450 + 1990 + 419 + 800);
    expect(sumOwedCents(splits)).toBe(totalCents);
    // a's item subtotal (1450 + 995) > b's (995) ⇒ a carries more tax+tip.
    const splitForUserA = splits.find((split) => split.userId === "a")!;
    const splitForUserB = splits.find((split) => split.userId === "b")!;
    expect(splitForUserA.owedCents).toBeGreaterThan(splitForUserB.owedCents);
  });

  it("rejects unassigned items", () => {
    expect(() =>
      computeItemizedSplits([{ name: "fries", totalCents: 450, assignments: [] }], 0, 0),
    ).toThrow(SplitError);
  });

  it("property: random receipts always reconcile", () => {
    let seed = 42;
    const nextRandom = (maxExclusive: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % maxExclusive;
    };
    for (let runIndex = 0; runIndex < 200; runIndex++) {
      const people = ["a", "b", "c", "d"].slice(0, 1 + nextRandom(4));
      const items = Array.from({ length: 1 + nextRandom(6) }, (_unused, itemIndex) => ({
        name: `item${itemIndex}`,
        totalCents: 1 + nextRandom(5000),
        assignments: people
          .filter((_person, personIndex) => personIndex === 0 || nextRandom(2) === 1)
          .map((userId) => ({ userId, weight: 1 + nextRandom(3) })),
      }));
      const taxCents = nextRandom(1000);
      const tipCents = nextRandom(1500);
      const { splits, totalCents } = computeItemizedSplits(items, taxCents, tipCents);
      expect(sumOwedCents(splits)).toBe(totalCents);
      expect(totalCents).toBe(
        items.reduce((runningTotal, item) => runningTotal + item.totalCents, 0) +
          taxCents +
          tipCents,
      );
    }
  });
});

describe("itemShareCents", () => {
  const item = {
    name: "Croque Madame",
    totalCents: 3300,
    assignments: [
      { userId: "a", weight: 1 },
      { userId: "b", weight: 1 },
      { userId: "c", weight: 1 },
    ],
  };

  it("splits an item evenly among everyone on it", () => {
    expect(itemShareCents(item, "a")).toBe(1100);
    expect(itemShareCents(item, "b")).toBe(1100);
    expect(itemShareCents(item, "c")).toBe(1100);
  });

  it("returns null for somebody who is not on the item", () => {
    // The distinction the detail page needs: "not on this" is not "owes 0".
    expect(itemShareCents(item, "nobody")).toBeNull();
  });

  it("honours weights rather than assuming an even split", () => {
    const shared = {
      name: "Bottle",
      totalCents: 3000,
      assignments: [
        { userId: "a", weight: 2 },
        { userId: "b", weight: 1 },
      ],
    };
    expect(itemShareCents(shared, "a")).toBe(2000);
    expect(itemShareCents(shared, "b")).toBe(1000);
  });

  it("agrees with computeItemizedSplits to the cent when it does not divide", () => {
    // 1000 / 3 is the case that exposes a naive divide: the shares must still
    // sum to the item total, and each person must be shown the cent the split
    // actually gave them.
    const uneven = {
      name: "Tea",
      totalCents: 1000,
      assignments: [
        { userId: "a", weight: 1 },
        { userId: "b", weight: 1 },
        { userId: "c", weight: 1 },
      ],
    };
    const shares = ["a", "b", "c"].map((userId) => itemShareCents(uneven, userId)!);
    expect(shares.reduce((running, cents) => running + cents, 0)).toBe(1000);

    const { splits } = computeItemizedSplits([uneven], 0, 0);
    for (const split of splits) {
      expect(itemShareCents(uneven, split.userId)).toBe(split.owedCents);
    }
  });
});

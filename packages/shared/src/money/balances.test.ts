/** Unit tests for per-currency balance helpers. */

import { describe, expect, it } from "vitest";
import {
  leadingBucket,
  outstandingBuckets,
  positionCaption,
  totalsByCurrency,
} from "./balances";

describe("totalsByCurrency", () => {
  it("keeps every currency apart and puts the default first", () => {
    // The audit's scenario: 1000 owed in USD and 1000 owed in EUR must never
    // read as 2000 of anything.
    const totals = totalsByCurrency(
      [
        { balances: [{ currency: "EUR", cents: 1000 }] },
        { balances: [{ currency: "USD", cents: -1000 }, { currency: "EUR", cents: 500 }] },
      ],
      "USD",
    );
    expect(totals).toEqual([
      { currency: "USD", owedToYouCents: 0, youOweCents: 1000 },
      { currency: "EUR", owedToYouCents: 1500, youOweCents: 0 },
    ]);
  });

  it("ignores zero buckets and returns nothing for a settled list", () => {
    expect(totalsByCurrency([{ balances: [{ currency: "USD", cents: 0 }] }], "USD")).toEqual([]);
  });
});

describe("leadingBucket", () => {
  it("picks the largest outstanding amount and skips zeros", () => {
    expect(
      leadingBucket([
        { currency: "USD", cents: 0 },
        { currency: "EUR", cents: -300 },
        { currency: "GBP", cents: 900 },
      ]),
    ).toEqual({ currency: "GBP", cents: 900 });
    expect(leadingBucket([{ currency: "USD", cents: 0 }])).toBeUndefined();
  });
});

describe("outstandingBuckets", () => {
  it("drops zeros and orders the default currency first", () => {
    expect(
      outstandingBuckets(
        [
          { currency: "EUR", cents: 5 },
          { currency: "USD", cents: 0 },
          { currency: "BDT", cents: -7 },
        ],
        "BDT",
      ),
    ).toEqual([
      { currency: "BDT", cents: -7 },
      { currency: "EUR", cents: 5 },
    ]);
  });
});

describe("positionCaption", () => {
  it("is one phrase when every currency points the same way", () => {
    expect(positionCaption([])).toBe("settled up");
    expect(positionCaption([{ currency: "USD", cents: 500 }])).toBe("owes you");
    expect(
      positionCaption([
        { currency: "USD", cents: -500 },
        { currency: "EUR", cents: -100 },
      ]),
    ).toBe("you owe");
  });

  it("follows the buckets' order when they point both ways", () => {
    // The row shows $12.69 (you owe) above €75.99 (owes you); the caption has
    // to read in that order or each phrase lands on the wrong amount.
    expect(
      positionCaption([
        { currency: "USD", cents: -1269 },
        { currency: "EUR", cents: 7599 },
      ]),
    ).toBe("you owe · owes you");
    expect(
      positionCaption([
        { currency: "USD", cents: 1269 },
        { currency: "EUR", cents: -7599 },
      ]),
    ).toBe("owes you · you owe");
  });

  it("ignores a currency with nothing in it", () => {
    expect(
      positionCaption([
        { currency: "USD", cents: 0 },
        { currency: "EUR", cents: 7599 },
      ]),
    ).toBe("owes you");
  });
});

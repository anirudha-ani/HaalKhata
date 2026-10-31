/** Unit tests for reading a group's balances one currency at a time. */

import { describe, expect, it } from "vitest";
import {
  groupBalanceSections,
  groupPositionCaption,
  memberBuckets,
  memberDebts,
  yourGroupBuckets,
} from "./currencyBalances";

const dollars = {
  currency: "USD",
  nets: [
    { userId: "ana", netCents: 10000 },
    { userId: "ben", netCents: -10000 },
    { userId: "cara", netCents: 0 },
  ],
  debts: [{ fromUserId: "ben", toUserId: "ana", amountCents: 10000 }],
  simplified: [{ fromUserId: "ben", toUserId: "ana", amountCents: 10000 }],
};
const euros = {
  currency: "EUR",
  nets: [
    { userId: "ana", netCents: -10000 },
    { userId: "ben", netCents: 10000 },
  ],
  debts: [{ fromUserId: "ana", toUserId: "ben", amountCents: 10000 }],
  simplified: [{ fromUserId: "ana", toUserId: "ben", amountCents: 10000 }],
};

describe("groupBalanceSections", () => {
  it("takes the server's sections as they come, the group's own currency first", () => {
    const reply = { nets: dollars.nets, debts: dollars.debts, simplified: dollars.simplified, byCurrency: [dollars, euros] };
    expect(groupBalanceSections(reply, "USD").map((section) => section.currency)).toEqual(["USD", "EUR"]);
  });

  it("reads a reply from before sections, or a cached one, as the group's own currency", () => {
    const fromBefore = { nets: dollars.nets, debts: dollars.debts, simplified: dollars.simplified };
    expect(groupBalanceSections(fromBefore, "USD")).toEqual([dollars]);
    expect(groupBalanceSections({ ...fromBefore, byCurrency: [] }, "USD")).toEqual([dollars]);
  });
});

describe("memberBuckets", () => {
  it("collects one person's balances across currencies, leaving out the settled ones", () => {
    expect(memberBuckets([dollars, euros], "ben")).toEqual([
      { currency: "USD", cents: -10000 },
      { currency: "EUR", cents: 10000 },
    ]);
    expect(memberBuckets([dollars, euros], "cara")).toEqual([]);
  });
});

describe("yourGroupBuckets", () => {
  it("reads the per-currency balances when the server sends them", () => {
    expect(
      yourGroupBuckets({
        yourNetCents: -10000,
        yourBalances: [
          { currency: "USD", cents: -10000 },
          { currency: "EUR", cents: 10000 },
        ],
        group: { currency: "USD" },
      }),
    ).toEqual([
      { currency: "USD", cents: -10000 },
      { currency: "EUR", cents: 10000 },
    ]);
  });

  it("falls back to the group's own currency for a reply from before them", () => {
    expect(yourGroupBuckets({ yourNetCents: 2500, group: { currency: "INR" } })).toEqual([
      { currency: "INR", cents: 2500 },
    ]);
    expect(yourGroupBuckets({ yourNetCents: 0, yourBalances: [], group: { currency: "INR" } })).toEqual([]);
  });
});

describe("groupPositionCaption", () => {
  it("says one direction once, and both in the amounts' order when they differ", () => {
    expect(groupPositionCaption([])).toBe("settled up");
    expect(groupPositionCaption([{ currency: "USD", cents: 500 }])).toBe("owed to you");
    expect(groupPositionCaption([{ currency: "USD", cents: -500 }, { currency: "EUR", cents: -100 }])).toBe("you owe");
    expect(groupPositionCaption([{ currency: "USD", cents: -500 }, { currency: "EUR", cents: 100 }])).toBe(
      "you owe · owed to you",
    );
  });
});

describe("memberDebts", () => {
  // Dev's total is zero, yet Ben owes him and he owes Ana.
  const trip = {
    currency: "USD",
    nets: [
      { userId: "ana", netCents: 5000 },
      { userId: "ben", netCents: -5000 },
      { userId: "dev", netCents: 0 },
    ],
    debts: [
      { fromUserId: "ben", toUserId: "dev", amountCents: 5000 },
      { fromUserId: "dev", toUserId: "ana", amountCents: 5000 },
    ],
    simplified: [{ fromUserId: "ben", toUserId: "ana", amountCents: 5000 }],
  };

  it("reads the person-to-person debts naming a member whose total is zero", () => {
    expect(memberDebts([trip], "dev", false)).toEqual([
      { currency: "USD", counterpartId: "ben", cents: 5000 },
      { currency: "USD", counterpartId: "ana", cents: -5000 },
    ]);
  });

  it("finds none once the group simplifies, since the plan routes around them", () => {
    expect(memberDebts([trip], "dev", true)).toEqual([]);
    expect(memberDebts([trip], "ben", true)).toEqual([{ currency: "USD", counterpartId: "ana", cents: -5000 }]);
  });

  it("does not count a loop that cancels out", () => {
    const loop = {
      currency: "USD",
      nets: [
        { userId: "ana", netCents: 0 },
        { userId: "ben", netCents: 0 },
        { userId: "dev", netCents: 0 },
      ],
      debts: [
        { fromUserId: "ben", toUserId: "ana", amountCents: 1000 },
        { fromUserId: "dev", toUserId: "ben", amountCents: 1000 },
        { fromUserId: "ana", toUserId: "dev", amountCents: 1000 },
      ],
      simplified: [],
    };
    expect(memberDebts([loop], "dev", false)).toEqual([]);
  });
});


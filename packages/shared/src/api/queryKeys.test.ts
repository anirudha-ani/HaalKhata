/** Unit tests for the query-key registry. */

import { describe, expect, test } from "vitest";
import { MONEY_KEYS, queryKeys } from "./queryKeys";

/** How TanStack Query hashes a key, i.e. what actually decides cache identity. */
const hash = (cacheKey: readonly unknown[]) => JSON.stringify(cacheKey);

describe("queryKeys", () => {
  test("the paginated feed never collides with the plain activity list", () => {
    // These back a useInfiniteQuery and a useQuery respectively. Sharing an
    // entry makes the infinite query read `data.pages` off a plain response
    // and throw "Cannot read properties of undefined (reading 'length')".
    expect(hash(queryKeys.activityFeed())).not.toBe(hash(queryKeys.activity()));
    expect(hash(queryKeys.activityFeed(undefined, ""))).not.toBe(hash(queryKeys.activity()));
    expect(hash(queryKeys.activityFeed("group-1"))).not.toBe(hash(queryKeys.activity("group-1")));
  });

  test("a different month is a different cache entry", () => {
    expect(hash(queryKeys.activityFeed(undefined, "2026-07"))).not.toBe(
      hash(queryKeys.activityFeed(undefined, "2026-06")),
    );
  });

  test("both activity keys still sit under the prefix one invalidation clears", () => {
    const prefix = MONEY_KEYS.find((moneyKey) => moneyKey[0] === "activity");
    expect(prefix).toBeDefined();
    expect(queryKeys.activity()[0]).toBe("activity");
    expect(queryKeys.activityFeed()[0]).toBe("activity");
  });

  test("scoping by group is distinct from the global feed", () => {
    expect(hash(queryKeys.activity("group-1"))).not.toBe(hash(queryKeys.activity()));
    expect(hash(queryKeys.groupBalances("group-1"))).not.toBe(hash(queryKeys.group("group-1")));
  });

  test("no two distinct resources hash alike", () => {
    const keys = [
      queryKeys.me,
      queryKeys.groups,
      queryKeys.group("id-1"),
      queryKeys.groupBalances("id-1"),
      queryKeys.expenses({}),
      queryKeys.expense("id-1"),
      queryKeys.overallBalances,
      queryKeys.friends,
      queryKeys.friendLedger("id-1"),
      queryKeys.friendStatement("id-1"),
      queryKeys.earlierComments("id-1", "cursor"),
      queryKeys.activity(),
      queryKeys.activityFeed(),
      queryKeys.notifications,
      queryKeys.paymentMethods,
      queryKeys.insights(6),
      queryKeys.adminUsage,
    ].map(hash);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("each insights window is its own entry, and a money mutation clears them all", () => {
    expect(hash(queryKeys.insights(6))).not.toBe(hash(queryKeys.insights(12)));
    // A new expense changes the charts, so insights must sit under a prefix
    // the money invalidation sweeps.
    expect(MONEY_KEYS.some((moneyKey) => moneyKey[0] === queryKeys.insights(6)[0])).toBe(true);
  });

  test("the paged statement and comments never share an entry with the plain reads beside them", () => {
    // The settle dialog reads the ledger through a plain useQuery and the
    // friend's page through an infinite one; an expense's detail is plain,
    // its earlier comments infinite.
    expect(hash(queryKeys.friendStatement("id-1"))).not.toBe(hash(queryKeys.friendLedger("id-1")));
    expect(hash(queryKeys.earlierComments("id-1", ""))).not.toBe(hash(queryKeys.expense("id-1")));
    // …and each sits under the prefix the other is invalidated by.
    expect(queryKeys.friendStatement("id-1").slice(0, 3)).toEqual([...queryKeys.friendLedger("id-1")]);
    expect(queryKeys.earlierComments("id-1", "c").slice(0, 2)).toEqual([...queryKeys.expense("id-1")]);
  });

  test("each scope of the expenses page is its own paged list", () => {
    expect(hash(queryKeys.expenses({ scope: "oneoff" }))).not.toBe(hash(queryKeys.expenses({})));
    expect(hash(queryKeys.expenses({ scope: "group-1" }))).not.toBe(hash(queryKeys.expenses({ groupId: "group-1" })));
    expect(hash(queryKeys.earlierComments("id-1", "a"))).not.toBe(hash(queryKeys.earlierComments("id-1", "b")));
  });

  test("the operator's overview is not swept by a user's money mutation", () => {
    expect(MONEY_KEYS.some((moneyKey) => moneyKey[0] === queryKeys.adminUsage[0])).toBe(false);
  });
});

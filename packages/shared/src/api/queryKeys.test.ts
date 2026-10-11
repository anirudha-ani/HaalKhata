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
      queryKeys.activity(),
      queryKeys.activityFeed(),
      queryKeys.notifications,
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

  test("the operator's overview is not swept by a user's money mutation", () => {
    expect(MONEY_KEYS.some((moneyKey) => moneyKey[0] === queryKeys.adminUsage[0])).toBe(false);
  });
});

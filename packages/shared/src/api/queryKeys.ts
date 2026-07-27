/** Central React Query key registry — every useXAPI hook keys from here. */

/**
 * Query-key builders for every server resource the app caches.
 * Static keys are plain tuples; parameterized keys are builder functions.
 */
export const queryKeys = {
  /** The signed-in user's profile. */
  me: ["me"] as const,
  /** The list of groups the user belongs to. */
  groups: ["groups"] as const,
  /**
   * A single group's detail.
   * @param groupId - The group's identifier.
   * @returns The query key tuple for that group.
   */
  group: (groupId: string) => ["groups", groupId] as const,
  /**
   * Per-member balances within a group.
   * @param groupId - The group's identifier.
   * @returns The query key tuple for that group's balances.
   */
  groupBalances: (groupId: string) => ["groups", groupId, "balances"] as const,
  /**
   * An expense list scoped by group and/or counterparty.
   * @param filter - Optional scoping: `groupId` limits to one group, `withUserId` to expenses shared with one user.
   * @returns The query key tuple for that filtered expense list.
   */
  expenses: (filter: { groupId?: string; withUserId?: string }) =>
    ["expenses", filter.groupId ?? "", filter.withUserId ?? ""] as const,
  /**
   * A single expense's detail.
   * @param expenseId - The expense's identifier.
   * @returns The query key tuple for that expense.
   */
  expense: (expenseId: string) => ["expense", expenseId] as const,
  /** The user's net balances across all groups and friends. */
  overallBalances: ["balances", "overall"] as const,
  /** The user's friends list. */
  friends: ["friends"] as const,
  /**
   * The full shared history with one friend.
   * @param friendId - The friend's identifier.
   * @returns The query key tuple for that friendship's ledger.
   */
  friendLedger: (friendId: string) => ["friends", friendId, "ledger"] as const,
  /**
   * A single page of activity, for callers that just want the latest events
   * (the dashboard's recent-activity strip).
   * @param groupId - The group to scope to; omit for the global feed.
   * @returns The query key tuple for that activity list.
   */
  activity: (groupId?: string) => ["activity", groupId ?? ""] as const,
  /**
   * The paginated activity feed.
   *
   * Deliberately a different key from {@link activity}, not a longer version
   * of it: this one backs a `useInfiniteQuery`, whose cache entry is
   * `{ pages, pageParams }`, while `activity` backs a plain `useQuery` whose
   * entry is the raw response. Share a key between the two and whichever
   * loads first wins — the infinite query then reads `data.pages` off a plain
   * response and throws "Cannot read properties of undefined". The trailing
   * marker makes the collision impossible while keeping the "activity" prefix
   * so one invalidation still clears both.
   *
   * @param groupId - The group to scope to; omit for the global feed.
   * @param month - "YYYY-MM" to scope to one month; omit for all time. Part
   *   of the key so changing months starts a fresh paginated list instead of
   *   appending to the previous month's pages.
   * @returns The query key tuple for that paginated feed.
   */
  activityFeed: (groupId?: string, month?: string) =>
    ["activity", groupId ?? "", month ?? "", "feed"] as const,
  /** The user's notification list and unread count. */
  notifications: ["notifications"] as const,
};

/** Everything money-related that a new expense/settlement can change — invalidate these key prefixes after mutations. */
export const MONEY_KEYS = [["groups"], ["expenses"], ["expense"], ["balances"], ["friends"], ["activity"], ["notifications"]];

/**
 * What a comment changes: it lands in the feed and notifies the other
 * participants, but moves no money. Bare prefixes rather than built keys, so
 * one pass also clears the group-scoped feeds a comment shows up in.
 */
export const FEED_KEYS = [["activity"], ["notifications"]];

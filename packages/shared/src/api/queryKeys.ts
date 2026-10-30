/** Central React Query key registry — every useXAPI hook keys from here. */

/**
 * Query-key builders for every server resource the app caches.
 * Static keys are plain tuples; parameterized keys are builder functions.
 */
export const queryKeys = {
  /** Public provider availability from the backend used by this client. */
  signInOptions: ["auth", "sign-in-options"] as const,
  /** @param token Public invite token. @returns Its preview cache key. */
  invitePreview: (token: string) => ["invite-preview", token] as const,
  /** Caller-owned blocked accounts. */
  blockedUsers: ["safety", "blocks"] as const,
  /** Receipt processor disclosure fetched before image sharing. */
  receiptProcessingInfo: ["receipt", "processing-info"] as const,
  /** The signed-in user's phones that receive push notifications. */
  pushDevices: ["push", "devices"] as const,
  /** Which push categories the signed-in user wants. */
  pushPreferences: ["push", "preferences"] as const,
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
   * A paged expense list scoped by group and/or counterparty. Backs a
   * `useInfiniteQuery`; every list of expenses is one.
   * @param filter - Optional scoping: `groupId` limits to one group,
   *   `withUserId` to expenses shared with one user, `scope` to one part of
   *   the caller's own list (the all-expenses page's chips). Part of the key,
   *   so changing it starts a fresh paged list rather than appending to the
   *   previous one's pages.
   * @returns The query key tuple for that filtered expense list.
   */
  expenses: (filter: { groupId?: string; withUserId?: string; scope?: string }) =>
    ["expenses", filter.groupId ?? "", filter.withUserId ?? "", filter.scope ?? "all"] as const,
  /**
   * A single expense's detail.
   * @param expenseId - The expense's identifier.
   * @returns The query key tuple for that expense.
   */
  expense: (expenseId: string) => ["expense", expenseId] as const,
  /** The small read an open edit form repeats to learn that somebody saved a change. */
  expenseVersion: (expenseId: string) => ["expense-version", expenseId] as const,
  /**
   * The comments older than the ones an expense's detail carries, paged
   * back from its `commentsNextCursor`. That cursor is part of the key: when
   * a new comment moves the detail's window, the earlier pages start again
   * from the new edge instead of leaving a gap. Under the expense's prefix,
   * so invalidating the expense clears them too.
   * @param expenseId - The expense's identifier.
   * @param cursor - The detail's `commentsNextCursor`.
   * @returns The query key tuple for those earlier comments.
   */
  earlierComments: (expenseId: string, cursor: string) =>
    ["expense", expenseId, "comments", cursor] as const,
  /** The user's net balances across all groups and friends. */
  overallBalances: ["balances", "overall"] as const,
  /** The user's friends list. */
  friends: ["friends"] as const,
  /**
   * The position with one friend, as a settle dialog reads it: the
   * GetFriendLedger response through a plain `useQuery`.
   * @param friendId - The friend's identifier.
   * @returns The query key tuple for that friendship's ledger.
   */
  friendLedger: (friendId: string) => ["friends", friendId, "ledger"] as const,
  /**
   * The statement with one friend, page by page: a `useInfiniteQuery` whose
   * first page is GetFriendLedger and the rest ListFriendLedgerEntries.
   * Longer than {@link friendLedger} so one invalidation clears both, and
   * never equal to it, since a plain query and an infinite one cannot share
   * a cache entry.
   * @param friendId - The friend's identifier.
   * @returns The query key tuple for that statement.
   */
  friendStatement: (friendId: string) => ["friends", friendId, "ledger", "statement"] as const,
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
  /**
   * The signed-in user's own payment methods. A key of its own rather than
   * one nested under `me`: invalidating the profile must not refetch these,
   * and nothing a payment or an expense does changes them.
   */
  paymentMethods: ["paymentMethods"] as const,
  /**
   * The user's own insights for one window size.
   * @param months - How many calendar months the window covers.
   * @returns The query key tuple for that window.
   */
  insights: (months: number) => ["insights", months] as const,
  /** Everything cached for the admin surface; forgotten together when the admin session ends. */
  admin: ["admin"] as const,
  /** The operator's usage overview on the admin surface. */
  adminUsage: ["admin", "usage"] as const,
  /**
   * One window of the operator's usage trend: its unit (a TrendUnit value)
   * and the day its last period holds ("" for today).
   */
  adminTrend: (unit: number, endOn: string) => ["admin", "trend", unit, endOn] as const,
  /** The operator's report queue on the admin surface. */
  adminReports: ["admin", "reports"] as const,
};

/** Everything money-related that a new expense/settlement can change — invalidate these key prefixes after mutations. */
export const MONEY_KEYS = [["groups"], ["expenses"], ["expense"], ["balances"], ["friends"], ["activity"], ["notifications"], ["insights"]];

/**
 * What a comment changes: it lands in the feed and notifies the other
 * participants, but moves no money. Bare prefixes rather than built keys, so
 * one pass also clears the group-scoped feeds a comment shows up in.
 */
export const FEED_KEYS = [["activity"], ["notifications"]];

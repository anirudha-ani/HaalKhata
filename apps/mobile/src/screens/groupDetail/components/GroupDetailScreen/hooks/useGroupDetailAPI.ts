/** TanStack Query bindings for group detail: me, group, friends, expenses, balances, add/remove members. */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient, expenseClient, groupClient, socialClient } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Wraps every server call the group detail screen makes: the signed-in user,
 * the group (with members), the caller's friends (for the add-people picker),
 * the group's expenses, its balances, and the add-members mutation (which
 * refreshes the group, the group list and the friends list on success).
 *
 * @param groupId - Identifier of the group being viewed.
 * @returns An object with `me`, `group`, `groupError`, `friends`, `expenses`,
 *   `balances`, an `isLoading` flag covering the group and expense queries,
 *   `refresh`/`isRefreshing` for pull-to-refresh, and the `addMembers`,
 *   `removeMember`, `transferOwnership` and `addFriend` mutations.
 */
export function useGroupDetailAPI(groupId: string) {
  const queryClient = useQueryClient();

  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const group = useQuery({
    queryKey: queryKeys.group(groupId),
    queryFn: () => groupClient.getGroup({ groupId }),
  });
  const expenses = useQuery({
    queryKey: queryKeys.expenses({ groupId }),
    queryFn: () => expenseClient.listExpenses({ groupId, withUserId: "" }),
  });
  const balances = useQuery({
    queryKey: queryKeys.groupBalances(groupId),
    queryFn: () => expenseClient.getGroupBalances({ groupId }),
  });

  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });

  // The group's own feed, paged the same way the global activity screen
  // pages (keyset, driven by next_cursor). Same audience rule as everywhere:
  // the server only returns events this member is allowed to see.
  const activity = useInfiniteQuery({
    queryKey: queryKeys.activityFeed(groupId),
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      socialClient.listActivity({ groupId, cursor: pageParam, month: "" }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });

  /**
   * Adds people by id plus an optional email/phone that must resolve to an
   * already-connected account; on success refreshes this group, the group
   * list, and the friends list — adding somebody also befriends them.
   */
  const addMembers = useMutation({
    mutationFn: (input: { userIds: string[]; email: string; phone: string }) =>
      groupClient.addMembers({ groupId, name: "", ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups });
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
  });

  /**
   * Removes one member: the caller leaving, or the owner removing somebody
   * else. Membership decides what the caller may see and which balances the
   * leaver was part of, so success invalidates the whole money set — the
   * group list, this group, and every ledger — not just this group.
   */
  const removeMember = useMutation({
    mutationFn: (userId: string) => groupClient.removeMember({ groupId, userId }),
    onSuccess: () => {
      for (const moneyKey of MONEY_KEYS) queryClient.invalidateQueries({ queryKey: moneyKey });
    },
  });

  /**
   * Hands the group to another member. Roles change on this group and the
   * old owner may now leave, so the group and the list refresh.
   */
  const transferOwnership = useMutation({
    mutationFn: (userId: string) => groupClient.transferOwnership({ groupId, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups });
    },
  });

  /**
   * Sends a friend request to another member. The recipient must accept
   * before a friendship exists, so nothing here is invalidated — the server
   * deliberately does not expose outgoing-request state.
   */
  const addFriend = useMutation({
    mutationFn: (userId: string) =>
      socialClient.addFriend({ email: "", phone: "", name: "", userId }),
  });

  /**
   * Flips the group's simplify-debts mode. It changes which debts every
   * money surface shows — this group's balances, friend ledgers, the
   * dashboard — so success invalidates the whole money set, not just the
   * group.
   */
  const setSimplify = useMutation({
    mutationFn: (simplify: boolean) => groupClient.setSimplifyDebts({ groupId, simplify }),
    onSuccess: () => {
      for (const moneyKey of MONEY_KEYS) queryClient.invalidateQueries({ queryKey: moneyKey });
    },
  });

  /** Refetches the group, its expenses, balances and feed (pull-to-refresh). */
  const refresh = () => {
    void group.refetch();
    void expenses.refetch();
    void balances.refetch();
    void activity.refetch();
  };

  return {
    me: currentUser.data,
    group: group.data,
    groupError: group.error,
    friends: (friends.data?.friends ?? []).flatMap((friend) => (friend.user ? [friend.user] : [])),
    expenses: expenses.data,
    balances: balances.data,
    isLoading: group.isLoading || expenses.isLoading,
    refresh,
    isRefreshing: group.isRefetching || expenses.isRefetching || balances.isRefetching,
    addMembers,
    removeMember,
    transferOwnership,
    addFriend,
    setSimplify,
    activityEvents: (activity.data?.pages ?? []).flatMap((page) => page.events),
    activityLoading: activity.isLoading,
    activityHasMore: activity.hasNextPage,
    activityLoadingMore: activity.isFetchingNextPage,
    loadMoreActivity: () => void activity.fetchNextPage(),
  };
}

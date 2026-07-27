/** TanStack Query bindings for group detail: me, group, friends, expenses, balances, add-members. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient, expenseClient, groupClient, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Wraps every server call the group detail screen makes: the signed-in user,
 * the group (with members), the caller's friends (for the add-people picker),
 * the group's expenses, its balances, and the add-members mutation (which
 * refreshes the group, the group list and the friends list on success).
 *
 * @param groupId - Identifier of the group being viewed.
 * @returns An object with `me`, `group`, `groupError`, `friends`, `expenses`,
 *   `balances`, an `isLoading` flag covering the group and expense queries,
 *   `refresh`/`isRefreshing` for pull-to-refresh, and the `addMembers` mutation.
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

  /**
   * Adds people by id plus an optional email/phone newcomer; on success
   * refreshes this group, the group list, and the friends list — adding
   * somebody also befriends them.
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

  /** Refetches the group, its expenses, and its balances (pull-to-refresh). */
  const refresh = () => {
    void group.refetch();
    void expenses.refetch();
    void balances.refetch();
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
  };
}

/** TanStack Query bindings for group detail: me, group, expenses, balances, add-member. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient, expenseClient, groupClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Wraps every server call the group detail screen makes: the signed-in user,
 * the group (with members), its expenses, its balances, and the add-member
 * mutation (which refreshes the group and the group list on success).
 *
 * @param groupId - Identifier of the group being viewed.
 * @returns An object with `me`, `group`, `groupError`, `expenses`, `balances`,
 *   an `isLoading` flag covering the group and expense queries,
 *   `refresh`/`isRefreshing` for pull-to-refresh, and the `addMember` mutation.
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

  /** Invites a member by email; on success refreshes this group and the group list. */
  const addMember = useMutation({
    mutationFn: (input: { email: string; name: string }) =>
      groupClient.addMember({ groupId, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups });
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
    expenses: expenses.data,
    balances: balances.data,
    isLoading: group.isLoading || expenses.isLoading,
    refresh,
    isRefreshing: group.isRefetching || expenses.isRefetching || balances.isRefetching,
    addMember,
  };
}

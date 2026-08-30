/** Queries for the all-expenses screen: me, every expense involving me, group names. */

import { useQuery } from "@tanstack/react-query";
import { authClient, expenseClient, groupClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Fetches everything the expenses screen needs: the signed-in user, every
 * expense they pay for or owe on (groups and one-off alike), the users
 * referenced by those expenses, and the group list for filter chips and row
 * labels.
 *
 * @returns `me`, `expenses` (newest first), `userById`, `settledIds`, `groups`
 *   (the user's group summaries), `isLoading` (true until the expense list
 *   arrives), and `refresh`/`isRefreshing` for pull-to-refresh.
 */
export function useExpensesAPI() {
  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  // The unfiltered involving-me list; scope narrowing happens client-side so
  // switching chips is instant rather than a refetch per tap.
  const expensesQuery = useQuery({
    queryKey: queryKeys.expenses({}),
    queryFn: () => expenseClient.listExpenses({ groupId: "", withUserId: "" }),
  });
  // Same key as the groups screen, so neither pays for the other's visit.
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });

  /** Refetches the list and the group names (pull-to-refresh). */
  const refresh = () => {
    void expensesQuery.refetch();
    void groupsQuery.refetch();
  };

  return {
    me: currentUserQuery.data,
    expenses: expensesQuery.data?.expenses ?? [],
    userById: new Map((expensesQuery.data?.users ?? []).map((user) => [user.id, user])),
    settledIds: new Set(expensesQuery.data?.settledExpenseIds ?? []),
    groups: groupsQuery.data?.groups ?? [],
    isLoading: expensesQuery.isLoading,
    refresh,
    isRefreshing: expensesQuery.isRefetching,
  };
}

"use client";
/** Queries for the all-expenses page: me, every expense involving me, group names. */

import { useQuery } from "@tanstack/react-query";
import { authClient, expenseClient, groupClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Fetches everything the expenses page needs: the signed-in user, every
 * expense they pay for or owe on (groups and one-off alike), the users
 * referenced by those expenses, and the group list for filter chips and row
 * labels.
 *
 * @returns `me`, `expenses` (newest first), `userById`, `groups` (the user's
 *   group summaries), and `isLoading` (true until the expense list arrives).
 */
export function useExpensesAPI() {
  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  // The unfiltered involving-me list; scope narrowing happens client-side so
  // switching chips is instant rather than a refetch per click.
  const expensesQuery = useQuery({
    queryKey: queryKeys.expenses({}),
    queryFn: () => expenseClient.listExpenses({ groupId: "", withUserId: "" }),
  });
  // Same key as the groups page, so neither pays for the other's visit.
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });

  return {
    me: currentUserQuery.data,
    expenses: expensesQuery.data?.expenses ?? [],
    userById: new Map((expensesQuery.data?.users ?? []).map((user) => [user.id, user])),
    settledIds: new Set(expensesQuery.data?.settledExpenseIds ?? []),
    truncated: expensesQuery.data?.truncated ?? false,
    groups: groupsQuery.data?.groups ?? [],
    isLoading: expensesQuery.isLoading,
  };
}

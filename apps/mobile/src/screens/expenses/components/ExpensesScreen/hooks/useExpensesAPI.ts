/** Queries for the all-expenses screen: me, my expenses in one scope a page at a time, group names. */

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { authClient, errorMessage, expenseClient, groupClient } from "@/lib/api/connect";
import { EXPENSE_PAGE_SIZE } from "@haalkhata/shared/api/paging";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { mergeExpensePages } from "@haalkhata/shared/expense/pages";
import { scopeFilterRequest, type ExpenseScopeFilter } from "@haalkhata/shared/expense/scopeFilter";
import { usePullToRefresh } from "@/lib/hooks/usePullToRefresh";

/**
 * Fetches everything the expenses screen needs: the signed-in user, the
 * expenses they pay for or owe on in the chosen scope (groups and one-off
 * alike, or one of them) a page at a time, the users referenced by those
 * expenses, and the group list for filter chips and row labels.
 *
 * The scope is applied by the server and is part of the query key, so a
 * chip pages through every expense in its scope, and switching chips starts
 * a fresh paged list rather than hiding the loaded rows that do not match.
 *
 * @param scope - The active scope: "all", "oneoff", or a group id.
 * @returns `me`, `expenses` (every loaded one, newest first), `userById`,
 *   `settledIds`, `groups` (the user's group summaries), `isLoading` (true
 *   until the scope's first page arrives), `listError` for a failed first
 *   read, `hasMore`/`isLoadingMore`/`loadMore` with the `loadMoreError`
 *   beside that control, and `refresh`/`isRefreshing` for pull-to-refresh.
 */
export function useExpensesAPI(scope: ExpenseScopeFilter) {
  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  const expensesQuery = useInfiniteQuery({
    queryKey: queryKeys.expenses({ scope }),
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      expenseClient.listExpenses({
        groupId: "",
        withUserId: "",
        ...scopeFilterRequest(scope),
        cursor: pageParam,
        limit: EXPENSE_PAGE_SIZE,
      }),
    // An empty cursor means the oldest expense is loaded.
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });
  // Same key as the groups screen, so neither pays for the other's visit.
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });

  const merged = useMemo(
    () => mergeExpensePages(expensesQuery.data?.pages ?? []),
    [expensesQuery.data],
  );
  // A failed next page is said beside Show more, with the loaded rows left
  // in place; only a failed first read takes the list's place.
  const loadMoreFailure = expensesQuery.isFetchNextPageError ? expensesQuery.error : null;

  /** Refetches the list and the group names (pull-to-refresh). */
  const pull = usePullToRefresh(() => Promise.all([expensesQuery.refetch(), groupsQuery.refetch()]));

  return {
    me: currentUserQuery.data,
    expenses: merged.expenses,
    userById: merged.userById,
    settledIds: merged.settledIds,
    groups: groupsQuery.data?.groups ?? [],
    isLoading: expensesQuery.isLoading,
    listError:
      (loadMoreFailure ? null : expensesQuery.error) || currentUserQuery.error || groupsQuery.error,
    hasMore: expensesQuery.hasNextPage,
    isLoadingMore: expensesQuery.isFetchingNextPage,
    loadMore: () => void expensesQuery.fetchNextPage(),
    /** Why the last next page did not load; "" when it did. */
    loadMoreError: loadMoreFailure ? errorMessage(loadMoreFailure) : "",
    refresh: pull.refresh,
    isRefreshing: pull.isRefreshing,
  };
}

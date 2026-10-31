"use client";
/** Queries for the all-expenses page: me, my expenses a page at a time, group names. */

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { authClient, errorMessage, expenseClient, groupClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { EXPENSE_PAGE_SIZE } from "@haalkhata/shared/api/paging";
import { mergeExpensePages } from "@haalkhata/shared/expense/pages";
import { scopeFilterRequest, type ExpenseScopeFilter } from "@haalkhata/shared/expense/scopeFilter";

/**
 * Fetches everything the expenses page needs: the signed-in user, the
 * expenses they pay for or owe on (groups and one-off alike) a page at a
 * time, the users referenced by those expenses, and the group list for
 * filter chips and row labels.
 *
 * The scope is applied by the server and is part of the query key, so a
 * chip pages through every expense in it, and switching chips starts a
 * fresh list rather than hiding the rows already loaded.
 *
 * @param scope - The active scope filter: "all", "oneoff", or a group id.
 * @returns `me`, `expenses` (loaded so far, newest first), `userById`,
 *   `settledIds`, `groups` (the user's group summaries), `isLoading` (true
 *   until the first page arrives), `loadError`/`retry` for a failed first
 *   page, and `hasMore`/`loadMore`/`isLoadingMore`/`loadMoreError` for the
 *   next one.
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
    // An empty cursor means the server has nothing further.
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });
  // Same key as the groups page, so neither pays for the other's visit.
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });

  const pages = mergeExpensePages(expensesQuery.data?.pages ?? []);
  const failure = expensesQuery.error ? errorMessage(expensesQuery.error) : "";
  return {
    me: currentUserQuery.data,
    ...pages,
    groups: groupsQuery.data?.groups ?? [],
    isLoading: expensesQuery.isLoading,
    /** Why the first page did not load; "" when it did. */
    loadError: expensesQuery.isFetchNextPageError ? "" : failure,
    /** Reads the list again from the top. */
    retry: () => void expensesQuery.refetch(),
    hasMore: expensesQuery.hasNextPage,
    isLoadingMore: expensesQuery.isFetchingNextPage,
    loadMore: () => void expensesQuery.fetchNextPage(),
    /** Why the next page did not load; "" when it did. */
    loadMoreError: expensesQuery.isFetchNextPageError ? failure : "",
  };
}

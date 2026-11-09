/** Older payments involving this reader, paged back from the bill’s current window. */
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { expenseClient, errorMessage } from "@/lib/api/connect";

/**
 * @param expenseId - The open bill.
 * @param cursor - Continuation from the latest detail response.
 * @returns Loaded history, its people and a retryable action for the next page.
 */
export function useEarlierPaymentsAPI(expenseId: string, cursor: string) {
  const [requested, setRequested] = useState(false);
  const history = useInfiniteQuery({
    queryKey: queryKeys.earlierPayments(expenseId, cursor),
    initialPageParam: cursor,
    queryFn: ({ pageParam }) => expenseClient.listExpensePayments({ expenseId, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: requested && Boolean(cursor),
  });
  const pages = [...(history.data?.pages ?? [])].reverse();
  return {
    payments: pages.flatMap((page) => page.payments),
    people: new Map(pages.flatMap((page) => page.users.map((user) => [user.id, user] as const))),
    hasMore: Boolean(cursor) && (!history.data || history.hasNextPage),
    loading: history.isFetching,
    error: history.error ? errorMessage(history.error) : "",
    load: () => {
      if (!requested) setRequested(true);
      else if (!history.data) void history.refetch();
      else void history.fetchNextPage();
    },
  };
}

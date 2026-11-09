/** Older expense changes loaded on request, with errors beside their retry control. */
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Anchors older pages to the current detail's history boundary.
 * @param expenseId - Expense being read.
 * @param cursor - Detail's oldest history boundary.
 * @returns Loaded events, continuation state, loading and visible retry errors.
 */
export function useEarlierHistoryAPI(expenseId: string, cursor: string) {
  const boundary = `${expenseId}|${cursor}`;
  const [askedFor, setAskedFor] = useState("");
  const asked = askedFor === boundary;
  const earlier = useInfiniteQuery({
    queryKey: queryKeys.earlierExpenseHistory(expenseId, cursor),
    initialPageParam: cursor,
    queryFn: ({ pageParam }) => expenseClient.listExpenseHistory({ expenseId, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: asked && cursor !== "",
  });
  return {
    history: asked ? [...(earlier.data?.pages ?? [])].reverse().flatMap((page) => page.history) : [],
    hasEarlier: cursor !== "" && (!asked || !earlier.data || earlier.hasNextPage),
    isLoadingEarlier: earlier.isFetching,
    earlierError: earlier.error ? errorMessage(earlier.error) : "",
    /** Starts a page or retries the failed one without losing existing pages. */
    showEarlier: () => {
      if (!asked) setAskedFor(boundary);
      else if (!earlier.data) void earlier.refetch();
      else void earlier.fetchNextPage();
    },
  };
}

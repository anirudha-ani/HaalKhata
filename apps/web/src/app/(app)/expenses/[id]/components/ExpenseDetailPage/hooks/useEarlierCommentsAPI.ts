"use client";
/** The comments older than the ones an expense's detail carries, read a page at a time on request. */

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { COMMENT_PAGE_SIZE } from "@haalkhata/shared/api/paging";
import type { Comment } from "@haalkhata/protogen/expense/v1/expense_pb";

/**
 * Pages back through an expense's thread from the detail's
 * `commentsNextCursor`. Nothing is read until the person asks; the cursor is
 * part of the key, so when a new comment moves the detail's window the
 * earlier pages start again from its new edge rather than leave a gap.
 *
 * @param expenseId - The expense.
 * @param cursor - The detail's `commentsNextCursor`; "" when it holds the whole thread.
 * @returns `comments` (the earlier ones loaded, oldest first), `hasEarlier`,
 *   `showEarlier`, `isLoadingEarlier`, and `earlierError` for a failed page.
 */
export function useEarlierCommentsAPI(expenseId: string, cursor: string) {
  const [asked, setAsked] = useState(false);
  const earlier = useInfiniteQuery({
    queryKey: queryKeys.earlierComments(expenseId, cursor),
    initialPageParam: cursor,
    queryFn: ({ pageParam }) =>
      expenseClient.listComments({ expenseId, cursor: pageParam, limit: COMMENT_PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: asked && cursor !== "",
  });

  // Each page is oldest first and each one reaches further back, so the
  // thread reads the last page first.
  const comments: Comment[] = [...(earlier.data?.pages ?? [])]
    .reverse()
    .flatMap((page) => page.comments);
  return {
    comments,
    hasEarlier: cursor !== "" && (!earlier.data || earlier.hasNextPage),
    /** Reads the next earlier page; the first tap starts the read. */
    showEarlier: () => {
      if (!asked) setAsked(true);
      // A first page that failed is asked for again; after it, the next one.
      else if (!earlier.data) void earlier.refetch();
      else void earlier.fetchNextPage();
    },
    isLoadingEarlier: earlier.isFetching && !earlier.isRefetching,
    /** Why the last earlier page did not load; "" when it did. */
    earlierError: earlier.error ? errorMessage(earlier.error) : "",
  };
}

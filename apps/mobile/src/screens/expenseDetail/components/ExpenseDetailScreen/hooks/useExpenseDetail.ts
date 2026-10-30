/** Expense detail data + actions: getExpense query, earlier comments, comment and delete mutations. */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { authClient, errorMessage, expenseClient } from "@/lib/api/connect";
import { newOperationId } from "@/lib/api/operationId";
import { COMMENT_PAGE_SIZE } from "@haalkhata/shared/api/paging";
import { FEED_KEYS, MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Loads one expense (with its users and newest comments) and exposes the
 * screen's actions: reading earlier comments, adding a comment and deleting
 * the expense (which invalidates all money-related queries and navigates
 * back to the group or dashboard).
 *
 * The detail carries the newest page of the thread. Earlier comments are a
 * separate infinite query, paged back from the detail's cursor and read only
 * once the person asks. That cursor is part of the key: when a new comment
 * moves the detail's window, the earlier pages start again from its new
 * edge rather than leave a gap.
 *
 * @param expenseId - Id of the expense to load and act on.
 * @returns `me`, the expense `detail` response with `detailError`/`isLoading`,
 *   the whole loaded thread as `comments` (oldest first) with
 *   `hasEarlierComments`/`isLoadingEarlierComments`/`showEarlierComments`
 *   and `earlierCommentsError`, a `userById` lookup map, comment composer
 *   state (`comment`, `setComment`, `submitComment`, `isCommenting`), delete
 *   flow state (`confirmingDelete`, `setConfirmingDelete`, `remove`,
 *   `isRemoving`), and the last action `error`.
 */
export function useExpenseDetail(expenseId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [wantsEarlierComments, setWantsEarlierComments] = useState(false);

  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  const detailQuery = useQuery({
    queryKey: queryKeys.expense(expenseId),
    // The edit screen shares this key, so it sends the same request.
    queryFn: () => expenseClient.getExpense({ expenseId, commentLimit: COMMENT_PAGE_SIZE }),
  });

  const commentsCursor = detailQuery.data?.commentsNextCursor ?? "";
  const earlierQuery = useInfiniteQuery({
    queryKey: queryKeys.earlierComments(expenseId, commentsCursor),
    initialPageParam: commentsCursor,
    queryFn: ({ pageParam }) =>
      expenseClient.listComments({ expenseId, cursor: pageParam, limit: COMMENT_PAGE_SIZE }),
    // An empty cursor means the first comment is loaded.
    getNextPageParam: (page) => page.nextCursor || undefined,
    // Nothing is read until the person asks for earlier comments.
    enabled: wantsEarlierComments && commentsCursor !== "",
  });
  // Each page is oldest first and the pages go back in time, so the oldest
  // page leads; the detail's own newest comments follow.
  const earlierComments = wantsEarlierComments
    ? [...(earlierQuery.data?.pages ?? [])].reverse().flatMap((page) => page.comments)
    : [];
  const earlierFirstReadFailed = earlierQuery.isError && !earlierQuery.data;

  // One id per comment being sent: the same words sent again after a failure
  // are a retry, so a comment whose reply got lost is not stored twice.
  const commentAttempt = useRef<{ body: string; operationId: string } | null>(null);
  const addComment = useMutation({
    mutationFn: (attempt: { body: string; operationId: string }) =>
      expenseClient.addComment({ expenseId, ...attempt }),
    onSuccess: () => {
      commentAttempt.current = null;
      setComment("");
      queryClient.invalidateQueries({ queryKey: queryKeys.expense(expenseId) });
      // A comment is a feed event too, so the cached activity list is now stale.
      for (const feedQueryKey of FEED_KEYS) {
        queryClient.invalidateQueries({ queryKey: feedQueryKey });
      }
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const remove = useMutation({
    mutationFn: () => expenseClient.deleteExpense({ expenseId }),
    onSuccess: () => {
      // Balances everywhere change when an expense disappears.
      for (const moneyQueryKey of MONEY_KEYS) {
        queryClient.invalidateQueries({ queryKey: moneyQueryKey });
      }
      const groupId = detailQuery.data?.expense?.groupId;
      router.replace(groupId ? `/groups/${groupId}` : "/dashboard");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Every user referenced by the expense, keyed by user id for fast lookup. */
  const userById = new Map((detailQuery.data?.users ?? []).map((user) => [user.id, user]));

  return {
    me: currentUserQuery.data,
    detail: detailQuery.data,
    /** The loaded thread, oldest first: earlier pages, then the detail's newest comments. */
    comments: [...earlierComments, ...(detailQuery.data?.comments ?? [])],
    /** Whether older comments than the loaded ones exist. */
    hasEarlierComments:
      commentsCursor !== "" &&
      (!wantsEarlierComments || earlierQuery.isPending || earlierFirstReadFailed || earlierQuery.hasNextPage),
    isLoadingEarlierComments: wantsEarlierComments && earlierQuery.isFetching,
    /** Why the last earlier page did not load; "" when it did. */
    earlierCommentsError: earlierQuery.error ? errorMessage(earlierQuery.error) : "",
    /** Reads the next page of earlier comments: the first on the first ask, or again after it failed. */
    showEarlierComments: () => {
      if (!wantsEarlierComments) {
        setWantsEarlierComments(true);
        return;
      }
      if (earlierFirstReadFailed) {
        void earlierQuery.refetch();
        return;
      }
      void earlierQuery.fetchNextPage();
    },
    /**
     * The edits and the deletion, so the screen can decide whether a history
     * is worth showing at all. Every expense has a creation event; only a
     * later change makes the section say anything.
     */
    changes: (detailQuery.data?.history ?? []).filter(
      (event) => event.type === "expense_updated" || event.type === "expense_deleted",
    ),
    /** The deletion event when the expense has been deleted: who did it, and when. */
    deletion: (detailQuery.data?.history ?? []).find(
      (event) => event.type === "expense_deleted",
    ),
    detailError: detailQuery.error,
    retry: detailQuery.refetch,
    isLoading: detailQuery.isLoading,
    userById,
    comment,
    setComment,
    submitComment: () => {
      if (!comment.trim()) return;
      if (commentAttempt.current?.body !== comment) {
        commentAttempt.current = { body: comment, operationId: newOperationId() };
      }
      addComment.mutate(commentAttempt.current);
    },
    isCommenting: addComment.isPending,
    confirmingDelete,
    setConfirmingDelete,
    remove: () => remove.mutate(),
    isRemoving: remove.isPending,
    error,
  };
}

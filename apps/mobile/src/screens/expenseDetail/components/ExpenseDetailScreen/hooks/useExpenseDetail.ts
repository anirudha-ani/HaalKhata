/** Expense detail data + actions: getExpense query, comment and delete mutations. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { authClient, errorMessage, expenseClient } from "@/lib/api/connect";
import { FEED_KEYS, MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Loads one expense (with its users and comments) and exposes the screen's
 * actions: adding a comment and deleting the expense (which invalidates all
 * money-related queries and navigates back to the group or dashboard).
 *
 * @param expenseId - Id of the expense to load and act on.
 * @returns `me`, the expense `detail` response with `detailError`/`isLoading`,
 *   a `userById` lookup map, comment composer state (`comment`, `setComment`,
 *   `submitComment`, `isCommenting`), delete flow state (`confirmingDelete`,
 *   `setConfirmingDelete`, `remove`, `isRemoving`), and the last action `error`.
 */
export function useExpenseDetail(expenseId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  const detailQuery = useQuery({
    queryKey: queryKeys.expense(expenseId),
    queryFn: () => expenseClient.getExpense({ expenseId }),
  });

  const addComment = useMutation({
    mutationFn: (body: string) => expenseClient.addComment({ expenseId, body }),
    onSuccess: () => {
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
    isLoading: detailQuery.isLoading,
    userById,
    comment,
    setComment,
    submitComment: () => comment.trim() && addComment.mutate(comment),
    isCommenting: addComment.isPending,
    confirmingDelete,
    setConfirmingDelete,
    remove: () => remove.mutate(),
    isRemoving: remove.isPending,
    error,
  };
}

"use client";
/** Expense detail data + actions: getExpense query, comment and delete mutations. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient, errorMessage, expenseClient } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@/lib/api/queryKeys";

/**
 * Loads one expense (with its users and comments) and exposes the page's
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
      router.push(groupId ? `/groups/${groupId}` : "/dashboard");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Every user referenced by the expense, keyed by user id for fast lookup. */
  const userById = new Map((detailQuery.data?.users ?? []).map((user) => [user.id, user]));

  return {
    me: currentUserQuery.data,
    detail: detailQuery.data,
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

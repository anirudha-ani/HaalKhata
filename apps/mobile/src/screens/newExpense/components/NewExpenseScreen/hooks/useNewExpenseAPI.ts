/** Expense form queries (me, groups, friends, expense being edited) + create/update mutations. */

import type { MessageInitShape } from "@bufbuild/protobuf";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateExpenseRequestSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import { authClient, expenseClient, groupClient, socialClient } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@/lib/api/queryKeys";

/** Plain-object init shape of a CreateExpenseRequest proto message. */
export type CreateExpenseInput = MessageInitShape<typeof CreateExpenseRequestSchema>;

/**
 * Loads everything the expense form needs (current user, groups, friends,
 * and — when editing — the expense itself) and exposes the create/update
 * mutations, both of which invalidate every money-related query on success.
 *
 * @param editExpenseId - Id of the expense being edited, or "" when creating.
 * @returns `me`, `groups`, `friends`, `editing` (the getExpense response when
 *   editing), a combined `isLoading` flag, and the `create`/`update` mutations.
 */
export function useNewExpenseAPI(editExpenseId: string) {
  const queryClient = useQueryClient();

  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });
  const friendsQuery = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });
  const editingQuery = useQuery({
    queryKey: queryKeys.expense(editExpenseId),
    queryFn: () => expenseClient.getExpense({ expenseId: editExpenseId }),
    enabled: editExpenseId !== "",
  });

  /** Invalidates every balance/expense-affecting query after a write. */
  const invalidateMoney = () => {
    for (const moneyQueryKey of MONEY_KEYS) {
      queryClient.invalidateQueries({ queryKey: moneyQueryKey });
    }
  };

  const create = useMutation({
    mutationFn: (input: CreateExpenseInput) => expenseClient.createExpense(input),
    onSuccess: invalidateMoney,
  });
  const update = useMutation({
    mutationFn: (input: { expenseId: string; expense: CreateExpenseInput }) =>
      expenseClient.updateExpense(input),
    onSuccess: invalidateMoney,
  });

  return {
    me: currentUserQuery.data,
    groups: groupsQuery.data?.groups ?? [],
    friends: friendsQuery.data?.friends ?? [],
    editing: editingQuery.data,
    isLoading:
      currentUserQuery.isLoading ||
      groupsQuery.isLoading ||
      friendsQuery.isLoading ||
      (editExpenseId !== "" && editingQuery.isLoading),
    create,
    update,
  };
}

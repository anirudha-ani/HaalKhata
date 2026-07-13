"use client";
/** TanStack Query bindings for the scan route: parse-receipt and create-expense mutations plus me/groups/friends. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MessageInitShape } from "@bufbuild/protobuf";
import type { CreateExpenseRequestSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import { authClient, expenseClient, groupClient, receiptClient, socialClient } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@/lib/api/queryKeys";

/**
 * Wraps every server call the scan page makes: the signed-in user, groups and
 * friends (for the "who is this with?" picker), the AI parse-receipt mutation,
 * and the create-expense mutation (which invalidates all money-related caches
 * on success).
 *
 * @returns An object with `me`, `groups`, `friends`, an `isLoading` flag for
 *   the picker data, the `parse` mutation (takes a receipt image File), and
 *   the `create` mutation (takes a CreateExpenseRequest payload).
 */
export function useScanAPI() {
  const queryClient = useQueryClient();

  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const groups = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });
  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });

  /** Sends the receipt photo bytes to the AI parser and yields the structured draft. */
  const parse = useMutation({
    mutationFn: async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return receiptClient.parseReceipt({ image: bytes, mediaType: file.type });
    },
  });

  /** Creates the itemized expense; on success invalidates every money-related query. */
  const create = useMutation({
    mutationFn: (input: MessageInitShape<typeof CreateExpenseRequestSchema>) =>
      expenseClient.createExpense(input),
    onSuccess: () => {
      for (const moneyKey of MONEY_KEYS) queryClient.invalidateQueries({ queryKey: moneyKey });
    },
  });

  return {
    me: currentUser.data,
    groups: groups.data?.groups ?? [],
    friends: friends.data?.friends ?? [],
    isLoading: currentUser.isLoading || groups.isLoading,
    parse,
    create,
  };
}

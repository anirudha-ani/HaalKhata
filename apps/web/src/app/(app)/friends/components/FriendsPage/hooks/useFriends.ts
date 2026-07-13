"use client";
/** Composite hook for the friends route: queries, add-friend mutation, form and settle state. */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CounterpartyBalance } from "@haalkhata/protogen/common/v1/common_pb";
import { authClient, errorMessage, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@/lib/api/queryKeys";

/**
 * Provides all data and behavior the friends page needs: the signed-in user,
 * the friend list with per-friend balances, the add-friend-by-email form
 * state, and the settle-up modal target.
 *
 * @returns An object exposing `me` (the signed-in user), `friends`
 *   (counterparty balances), `isLoading`/`isAdding` flags, the `email` form
 *   state with `setEmail` and `submitAdd`, the last add-friend `error`
 *   message, and `settleWith`/`setSettleWith` controlling the settle-up modal.
 */
export function useFriends() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [settleWith, setSettleWith] = useState<CounterpartyBalance | null>(null);

  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });

  /** Adds a friend by email; on success clears the form and refreshes the friend list. */
  const addFriend = useMutation({
    mutationFn: () => socialClient.addFriend({ email, name: "" }),
    onSuccess: () => {
      setEmail("");
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return {
    me: currentUser.data,
    friends: friends.data?.friends ?? [],
    isLoading: friends.isLoading,
    email,
    setEmail,
    error,
    submitAdd: () => {
      setError("");
      addFriend.mutate();
    },
    isAdding: addFriend.isPending,
    settleWith,
    setSettleWith,
  };
}

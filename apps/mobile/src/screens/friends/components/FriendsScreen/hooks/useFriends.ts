/** Composite hook for the friends screen: queries, add-friend mutation, form and settle state. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CounterpartyBalance } from "@haalkhata/protogen/common/v1/common_pb";
import { useState } from "react";
import { splitIdentifier } from "@haalkhata/shared/auth/identifier";
import { authClient, errorMessage, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Provides all data and behavior the friends screen needs: the signed-in
 * user, the friend list with per-friend balances, the add-friend form state,
 * and the settle-up sheet target.
 *
 * The add form takes one identifier that may be an email address or a phone
 * number, routed by `splitIdentifier` the same way the login form routes it.
 *
 * @returns An object exposing `me` (the signed-in user), `friends`
 *   (counterparty balances) with `friendsError` when that query failed,
 *   `isLoading`/`isAdding` flags,
 *   `refresh`/`isRefreshing` for pull-to-refresh, the `identifier` form state
 *   with `setIdentifier` and `submitAdd`, the last add-friend `error` message,
 *   and `settleWith`/`setSettleWith` controlling the settle-up sheet.
 */
export function useFriends() {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settleWith, setSettleWith] = useState<CounterpartyBalance | null>(null);

  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });

  /** Sends a friend request without revealing whether the identifier matched. */
  const addFriend = useMutation({
    mutationFn: () => socialClient.addFriend({ ...splitIdentifier(identifier), name: "" }),
    onSuccess: () => {
      setIdentifier("");
      setNotice("If an account matches, they’ll receive a friend request.");
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Accepts or declines one incoming friend request. */
  const respondToRequest = useMutation({
    mutationFn: (response: { userId: string; accept: boolean }) =>
      socialClient.respondFriendRequest(response),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.friends }),
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return {
    me: currentUser.data,
    friends: friends.data?.friends ?? [],
    // Surfaced rather than swallowed: ListFriends shares the per-account
    // rate limit with the overall balances, and a refused call must not
    // render as "no friends yet".
    friendsError: friends.error,
    incomingRequests: friends.data?.incomingRequests ?? [],
    isLoading: friends.isLoading,
    refresh: () => void friends.refetch(),
    isRefreshing: friends.isRefetching,
    identifier,
    setIdentifier,
    error,
    notice,
    submitAdd: () => {
      setError("");
      setNotice("");
      addFriend.mutate();
    },
    isAdding: addFriend.isPending,
    respondToRequest: (userId: string, accept: boolean) => {
      setError("");
      respondToRequest.mutate({ userId, accept });
    },
    respondingUserId: respondToRequest.isPending ? respondToRequest.variables?.userId : undefined,
    respondingAccept: respondToRequest.isPending && respondToRequest.variables?.accept === true,
    settleWith,
    setSettleWith,
  };
}

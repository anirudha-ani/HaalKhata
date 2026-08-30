/** Composite hook for the friends screen: queries, add-friend mutation, form and settle state. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CounterpartyBalance } from "@haalkhata/protogen/common/v1/common_pb";
import { useMemo, useState } from "react";
import { splitIdentifier } from "@haalkhata/shared/auth/identifier";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
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
 *   `visibleFriends` (those matching `query`) with the `query`/`setQuery`
 *   search state, the headline `owedToYouCents`/`youOweCents` totals,
 *   `isLoading`/`isAdding` flags,
 *   `refresh`/`isRefreshing` for pull-to-refresh, the `identifier` form state
 *   with `setIdentifier` and `submitAdd`, the last add-friend `error` message,
 *   and `settleWith`/`setSettleWith` controlling the settle-up sheet.
 */
export function useFriends() {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [query, setQuery] = useState("");
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

  const allFriends = friends.data?.friends ?? [];
  // Filtering keeps the server's order (people you have expenses with first,
  // then the rest alphabetically) rather than re-ranking by match quality.
  // Names only: a friend's email and phone are private and arrive empty.
  const visibleFriends = useMemo(() => {
    const everyFriend = friends.data?.friends ?? [];
    const terms = searchTerms(query);
    if (terms.length === 0) return everyFriend;
    return everyFriend.filter((friend) => matchesTerms(terms, friend.user?.name));
  }, [friends.data, query]);

  // Headline totals, so the screen answers "where do I stand overall?"
  // before any individual row is read.
  const owedToYouCents = allFriends.reduce(
    (total, friend) => total + Math.max(friend.netCents, 0),
    0,
  );
  const youOweCents = allFriends.reduce(
    (total, friend) => total + Math.max(-friend.netCents, 0),
    0,
  );

  return {
    me: currentUser.data,
    friends: allFriends,
    // Surfaced rather than swallowed: ListFriends shares the per-account
    // rate limit with the overall balances, and a refused call must not
    // render as "no friends yet".
    friendsError: friends.error,
    incomingRequests: friends.data?.incomingRequests ?? [],
    visibleFriends,
    owedToYouCents,
    youOweCents,
    query,
    setQuery,
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

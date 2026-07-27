"use client";
/** Composite hook for the friends route: queries, add-friend mutation, form and settle state. */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CounterpartyBalance } from "@haalkhata/protogen/common/v1/common_pb";
import { splitIdentifier } from "@haalkhata/shared/auth/identifier";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { authClient, errorMessage, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Provides all data and behavior the friends page needs: the signed-in user,
 * the friend list with per-friend balances, the add-friend form state, and
 * the settle-up modal target.
 *
 * The add form takes one identifier that may be an email address or a phone
 * number, routed by `splitIdentifier` the same way the login form routes it.
 *
 * @returns An object exposing `me` (the signed-in user), `friends` (every
 *   counterparty balance) and `visibleFriends` (those matching `query`), the
 *   `query`/`setQuery` search state, `isLoading`/`isAdding` flags, the
 *   `identifier` form state with `setIdentifier` and `submitAdd`, the last
 *   add-friend `error` message, and `settleWith`/`setSettleWith` controlling
 *   the settle-up modal.
 */
export function useFriends() {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [settleWith, setSettleWith] = useState<CounterpartyBalance | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });

  /** Adds a friend by email or phone; on success clears the form and refreshes the list. */
  const addFriend = useMutation({
    mutationFn: () => socialClient.addFriend({ ...splitIdentifier(identifier), name: "" }),
    onSuccess: () => {
      setIdentifier("");
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const allFriends = friends.data?.friends ?? [];
  // Filtering keeps the server's order (people you have expenses with first,
  // then the rest alphabetically) rather than re-ranking by match quality.
  const visibleFriends = useMemo(() => {
    const everyFriend = friends.data?.friends ?? [];
    const terms = searchTerms(query);
    if (terms.length === 0) return everyFriend;
    return everyFriend.filter((friend) =>
      matchesTerms(terms, friend.user?.name, friend.user?.email, friend.user?.phone),
    );
  }, [friends.data, query]);

  // Headline totals, so the page answers "where do I stand overall?" before
  // any individual row is read.
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
    visibleFriends,
    owedToYouCents,
    youOweCents,
    query,
    setQuery,
    showAdd,
    setShowAdd,
    isLoading: friends.isLoading,
    identifier,
    setIdentifier,
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

/** Composite hook for the friends screen: queries, add-friend mutation, form and settle state. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useMemo, useState } from "react";
import {
  contactIsEmpty,
  contactPayload,
  EMPTY_CONTACT,
  INVALID_PHONE_MESSAGE,
  type ContactDraft,
} from "@haalkhata/shared/phone/contact";
import { totalsByCurrency, type CurrencyBucket } from "@haalkhata/shared/money/balances";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { authClient, errorMessage, socialClient } from "@/lib/api/connect";
import { shareInvite } from "@/lib/invite/share";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Provides all data and behavior the friends screen needs: the signed-in
 * user, the friend list with per-friend balances, the add-friend form state,
 * and the settle-up sheet target.
 *
 * The add form is an explicit email-or-phone choice; the phone side carries
 * its country and is validated client-side before anything is sent.
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
/**
 * A friend's position per currency. A server predating `balances` sends only
 * the default-currency scalar, which reads the same way as one bucket.
 *
 * @param friend - A counterparty balance from the friends list.
 * @param defaultCurrency - The caller's default currency.
 * @returns Non-zero buckets, or an empty list when settled.
 */
export function bucketsOf(
  friend: { netCents: number; balances: CurrencyBucket[] },
  defaultCurrency: string,
): CurrencyBucket[] {
  const buckets =
    friend.balances.length > 0
      ? friend.balances
      : [{ currency: defaultCurrency, cents: friend.netCents }];
  return buckets.filter((bucket) => bucket.cents !== 0);
}

export function useFriends() {
  const queryClient = useQueryClient();
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settleWith, setSettleWith] = useState<{
    user: User;
    currency: string;
    cents: number;
  } | null>(null);

  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });

  /** Sends a friend request without revealing whether the identifier matched. */
  const addFriend = useMutation({
    mutationFn: (payload: { email: string; phone: string }) =>
      socialClient.addFriend({ ...payload, name: "" }),
    onSuccess: () => {
      setContact(EMPTY_CONTACT);
      setNotice("If an account matches, they’ll receive a friend request.");
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /**
   * Shares an Invited friend's sign-up link through the native share sheet.
   * The link claims their invited identity, so friendships and any group
   * seats come with them when they join.
   */
  const remind = useMutation({
    mutationFn: async (person: User) => {
      const { token } = await socialClient.getFriendInviteLink({ userId: person.id });
      return shareInvite(token, currentUser.data?.name ?? "A friend", "");
    },
    onSuccess: (outcome) => {
      if (outcome === "shared") setNotice("Invite link shared ✓");
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

  const allFriends = useMemo(() => friends.data?.friends ?? [], [friends.data]);
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
  // before any individual row is read — per currency, never summed across.
  const currency = currentUser.data?.defaultCurrency || "USD";
  const totals = useMemo(
    () =>
      totalsByCurrency(
        allFriends.map((friend) => ({ balances: bucketsOf(friend, currency) })),
        currency,
      ),
    [allFriends, currency],
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
    totals,
    query,
    setQuery,
    isLoading: friends.isLoading,
    refresh: () => void friends.refetch(),
    isRefreshing: friends.isRefetching,
    contact,
    setContact,
    canSubmitAdd: !contactIsEmpty(contact),
    error,
    notice,
    submitAdd: () => {
      setError("");
      setNotice("");
      const payload = contactPayload(contact);
      // A number that cannot exist in the selected country never leaves the
      // form; the privacy-preserving empty response is only for real lookups.
      if (payload === null) {
        setError(INVALID_PHONE_MESSAGE);
        return;
      }
      addFriend.mutate(payload);
    },
    isAdding: addFriend.isPending,
    respondToRequest: (userId: string, accept: boolean) => {
      setError("");
      respondToRequest.mutate({ userId, accept });
    },
    remindFriend: (person: User) => {
      setError("");
      setNotice("");
      remind.mutate(person);
    },
    remindingUserId: remind.isPending ? remind.variables?.id : undefined,
    respondingUserId: respondToRequest.isPending ? respondToRequest.variables?.userId : undefined,
    respondingAccept: respondToRequest.isPending && respondToRequest.variables?.accept === true,
    settleWith,
    setSettleWith,
  };
}

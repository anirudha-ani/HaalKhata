"use client";
/** Composite hook for the friends route: queries, the selected tab, add-friend mutation, form and settle state. */

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { OutgoingFriendRequest } from "@haalkhata/protogen/social/v1/social_pb";
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
import type { FriendsTab } from "../../../constants/friendsTabs";

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

/**
 * Provides all data and behavior the friends page needs: the signed-in user,
 * the friend list with per-friend balances, the add-friend form state, and
 * the settle-up modal target.
 *
 * The add form is an explicit email-or-phone choice; the phone side carries
 * its country and is validated client-side before anything is sent.
 *
 * @returns An object exposing `me` (the signed-in user), `friends` (every
 *   counterparty balance) with `friendsError` when that query failed, split
 *   into `registeredFriends` and `invitedFriends`, `incomingRequests`
 *   awaiting the user and `outgoingRequests` the user is waiting on, the
 *   selected `tab` with `setTab`, `visibleFriends` (registered friends
 *   matching `query`), the
 *   `query`/`setQuery` search state, `isLoading`/`isAdding` flags, the
 *   `identifier` form state with `setIdentifier` and `submitAdd`, the last
 *   add-friend `error` message, and `settleWith`/`setSettleWith` controlling
 *   the settle-up modal.
 */
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
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState<FriendsTab>("friends");

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
      setShowAdd(false);
      setNotice("If an account matches, they’ll receive a friend request.");
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /**
   * Fetches an Invited friend's sign-up link and opens the share dialog
   * (QR code, copy, share sheet) — visible feedback wherever the button
   * is, instead of a silent clipboard write. The link claims their invited
   * identity, so friendships and any group seats come with them.
   */
  const [remindShare, setRemindShare] = useState<{ token: string; personName: string } | null>(
    null,
  );

  const remind = useMutation({
    mutationFn: async (person: User) => {
      const { token } = await socialClient.getFriendInviteLink({ userId: person.id });
      return { token, personName: person.name };
    },
    onSuccess: (share) => setRemindShare(share),
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Accepts or declines one request addressed to the current user. */
  const respondToRequest = useMutation({
    mutationFn: (response: { userId: string; accept: boolean }) =>
      socialClient.respondFriendRequest(response),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      // The Friends tab badge counts these; drop it as soon as one is answered.
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /**
   * Withdraws one request the current user sent. Named the way the server
   * showed it: the person's id when they were picked, otherwise the typed
   * identifier, so the client never needs the account behind an address.
   */
  const cancelRequest = useMutation({
    mutationFn: (target: { userId: string; identifier: string }) =>
      socialClient.cancelFriendRequest(target),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.friends }),
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Closes the error popup; the next action clears it anyway, this serves the dismiss button. */
  const dismissError = useCallback(() => setError(""), []);

  const allFriends = friends.data?.friends ?? [];
  // The Friends tab holds people who can carry a balance; Invited people
  // (no account yet, so no expenses) get a tab of their own rather than
  // sitting between them with a pill.
  const registeredFriends = useMemo(
    () => (friends.data?.friends ?? []).filter((friend) => friend.user?.registered),
    [friends.data],
  );
  const invitedFriends = useMemo(
    () => (friends.data?.friends ?? []).filter((friend) => friend.user && !friend.user.registered),
    [friends.data],
  );
  // Filtering keeps the server's order (people you have expenses with first,
  // then the rest alphabetically) rather than re-ranking by match quality.
  // Names only: a friend's email and phone are private and arrive empty.
  const visibleFriends = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return registeredFriends;
    return registeredFriends.filter((friend) => matchesTerms(terms, friend.user?.name));
  }, [registeredFriends, query]);

  // Headline totals, so the page answers "where do I stand overall?" before
  // any individual row is read — per currency, never summed across them.
  const currency = currentUser.data?.defaultCurrency || "USD";
  // Keyed on the query data, not on allFriends: that `?? []` fallback is a
  // fresh array on every render while the list is loading, which would make
  // this memo recompute each time for nothing.
  const totals = useMemo(
    () =>
      totalsByCurrency(
        (friends.data?.friends ?? []).map((friend) => ({
          balances: bucketsOf(friend, currency),
        })),
        currency,
      ),
    [friends.data, currency],
  );

  return {
    me: currentUser.data,
    friends: allFriends,
    // Surfaced rather than swallowed: ListFriends shares the per-account
    // rate limit with the overall balances, and a refused call must not
    // render as "no friends yet".
    friendsError: friends.error,
    registeredFriends,
    invitedFriends,
    incomingRequests: friends.data?.incomingRequests ?? [],
    outgoingRequests: friends.data?.outgoingRequests ?? [],
    tab: activeTab,
    setTab: setActiveTab,
    visibleFriends,
    totals,
    query,
    setQuery,
    showAdd,
    setShowAdd,
    isLoading: friends.isLoading,
    contact,
    setContact,
    canSubmitAdd: !contactIsEmpty(contact),
    error,
    dismissError,
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
    respondingUserId: respondToRequest.isPending ? respondToRequest.variables?.userId : undefined,
    cancelSentRequest: (request: OutgoingFriendRequest) => {
      setError("");
      cancelRequest.mutate(
        request.user
          ? { userId: request.user.id, identifier: "" }
          : { userId: "", identifier: request.identifier },
      );
    },
    /** The sent request being withdrawn right now, keyed as its row is: person id or identifier. */
    cancellingKey: cancelRequest.isPending
      ? cancelRequest.variables?.userId || cancelRequest.variables?.identifier
      : undefined,
    remindFriend: (person: User) => {
      setError("");
      setNotice("");
      remind.mutate(person);
    },
    remindingUserId: remind.isPending ? remind.variables?.id : undefined,
    /** The open remind dialog's link and person; null while closed. */
    remindShare,
    closeRemindShare: () => setRemindShare(null),
    /** Opens the OS share sheet with the link's message; for the dialog. */
    remindShareToSheet: () =>
      shareInvite(remindShare?.token ?? "", currentUser.data?.name ?? "A friend", ""),
    settleWith,
    setSettleWith,
  };
}

/** The controller object returned by {@link useFriends}, consumed by the page and its tabs. */
export type FriendsController = ReturnType<typeof useFriends>;

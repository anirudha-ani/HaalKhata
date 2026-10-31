"use client";
/** Composite hook for the friends route: queries, the selected tab, add-friend mutation, form and settle state. */

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Code, ConnectError } from "@connectrpc/connect";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { OutgoingFriendRequest } from "@haalkhata/protogen/social/v1/social_pb";
import {
  contactIsEmpty,
  contactPayload,
  EMPTY_CONTACT,
  INVALID_PHONE_MESSAGE,
  type ContactDraft,
} from "@haalkhata/shared/phone/contact";
import { totalsByCurrency } from "@haalkhata/shared/money/balances";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { authClient, errorMessage, socialClient } from "@/lib/api/connect";
import { shareProfileInvite } from "@/lib/invite/share";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { FriendsTab } from "../../../constants/friendsTabs";
import { bucketsOf } from "../utils/bucketsOf";

/**
 * Provides all data and behavior the friends page needs: the signed-in user,
 * the friend list with per-friend balances, the add-friend form state, and
 * the settle-up modal target.
 *
 * The add form is an explicit email-or-phone choice; the phone side carries
 * its country and is validated client-side before anything is sent. An
 * email or phone that belongs to nobody on HaalKhata is refused, and the
 * form offers the caller's own invite link instead: nothing is made for a
 * person until they sign up as themselves.
 *
 * @returns An object exposing `me` (the signed-in user), `friends` (every
 *   counterparty balance) with `friendsError` when that query failed,
 *   `incomingRequests` awaiting the user and `outgoingRequests` the user is
 *   waiting on, the selected `tab` with `setTab`, `visibleFriends` (friends
 *   matching `query`), the `query`/`setQuery` search state,
 *   `isLoading`/`isAdding` flags, the `contact` form state with `setContact`
 *   and `submitAdd`, `notOnHaalKhata` with `shareInviteLink` for the offer
 *   that replaces a refused add, `profileShareToken` for the share dialog it
 *   opens, the last `error` message, and `settleWith`/`setSettleWith`
 *   controlling the settle-up modal.
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
  // Set when the typed email or phone belongs to nobody on HaalKhata, so the
  // dialog offers the caller's invite link instead of a dead error.
  const [notOnHaalKhata, setNotOnHaalKhata] = useState(false);
  const [profileShareToken, setProfileShareToken] = useState("");
  const [activeTab, setActiveTab] = useState<FriendsTab>("friends");

  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });

  /**
   * Sends a friend request. An email or phone nobody on HaalKhata has comes
   * back as failed_precondition, which becomes the invite-link offer.
   */
  const addFriend = useMutation({
    mutationFn: (payload: { email: string; phone: string }) =>
      socialClient.addFriend({ ...payload, name: "" }),
    onSuccess: () => {
      setContact(EMPTY_CONTACT);
      setShowAdd(false);
      setNotice("Friend request sent — they’ll show up here once they accept.");
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
    onError: (mutationError) => {
      if (mutationError instanceof ConnectError && mutationError.code === Code.FailedPrecondition) {
        setNotOnHaalKhata(true);
        return;
      }
      setError(errorMessage(mutationError));
    },
  });

  /**
   * Fetches the caller's own profile link and opens the share dialog (QR
   * code, copy, share sheet) in place of the add dialog. Whoever opens the
   * link signs up and sends the caller a friend request to confirm.
   */
  const shareInviteLink = useMutation({
    mutationFn: async () => (await socialClient.getProfileInviteLink({})).token,
    onSuccess: (token) => {
      setNotOnHaalKhata(false);
      setContact(EMPTY_CONTACT);
      setShowAdd(false);
      setProfileShareToken(token);
    },
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

  const allFriends = useMemo(() => friends.data?.friends ?? [], [friends.data]);
  // Filtering keeps the server's order (people you have expenses with first,
  // then the rest alphabetically) rather than re-ranking by match quality.
  // Names only: a friend's email and phone are private and arrive empty.
  const visibleFriends = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return allFriends;
    return allFriends.filter((friend) => matchesTerms(terms, friend.user?.name));
  }, [allFriends, query]);

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
    incomingRequests: friends.data?.incomingRequests ?? [],
    outgoingRequests: friends.data?.outgoingRequests ?? [],
    tab: activeTab,
    setTab: setActiveTab,
    visibleFriends,
    totals,
    query,
    setQuery,
    showAdd,
    setShowAdd: (open: boolean) => {
      setNotOnHaalKhata(false);
      setShowAdd(open);
    },
    isLoading: friends.isLoading,
    contact,
    // An edit makes the offer about a contact that is no longer typed.
    setContact: (next: ContactDraft) => {
      setNotOnHaalKhata(false);
      setContact(next);
    },
    canSubmitAdd: !contactIsEmpty(contact),
    error,
    dismissError,
    notice,
    submitAdd: () => {
      setError("");
      setNotice("");
      setNotOnHaalKhata(false);
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
    notOnHaalKhata,
    shareInviteLink: () => {
      setError("");
      shareInviteLink.mutate();
    },
    sharingInviteLink: shareInviteLink.isPending,
    /** The open share dialog's profile-link token; "" while closed. */
    profileShareToken,
    closeProfileShare: () => setProfileShareToken(""),
    /** Opens the OS share sheet with the link's message; for the dialog. */
    profileShareToSheet: () =>
      shareProfileInvite(profileShareToken, currentUser.data?.name ?? "A friend"),
    settleWith,
    setSettleWith,
  };
}

/** The controller object returned by {@link useFriends}, consumed by the page and its tabs. */
export type FriendsController = ReturnType<typeof useFriends>;

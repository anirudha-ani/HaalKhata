/** Composite hook for the friends screen: queries, the selected tab, add-friend sheet, request actions, settle state. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { OutgoingFriendRequest } from "@haalkhata/protogen/social/v1/social_pb";
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
import { isNotOnHaalKhata } from "@/lib/api/notOnHaalKhata";
import { shareProfileInvite } from "@/lib/invite/share";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { FriendsTab } from "../../../constants/friendsTabs";
import { usePullToRefresh } from "@/lib/hooks/usePullToRefresh";

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
 * Provides all data and behavior the friends screen needs: the signed-in
 * user, the friend list with balances, incoming and sent requests with
 * their actions, the selected tab, the add-friend sheet state, and the
 * settle-up sheet target.
 *
 * The add form is an explicit email-or-phone choice; the phone side carries
 * its country and is validated client-side before anything is sent. Only
 * somebody who has signed up can be added: for an email or phone nobody on
 * HaalKhata has, the sheet offers the caller's own invite link instead.
 *
 * @returns An object exposing `me`, `friends` (every counterparty balance)
 *   with `friendsError` when that query failed, `incomingRequests` awaiting
 *   the user and `outgoingRequests` the user is waiting on, the selected
 *   `tab` with `setTab`, `visibleFriends` (friends matching `query`), the
 *   headline `totals`, loading and refresh state, the `showAdd` sheet state,
 *   the `contact` form state with `submitAdd`, `notOnHaalKhata` with
 *   `shareInviteLink` for a contact nobody has, the last action `error` and
 *   `notice`, the request actions, the invite-link sheet state, and
 *   `settleWith`/`setSettleWith` for the settle-up sheet.
 */
export function useFriends() {
  const queryClient = useQueryClient();
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Set when the typed email or phone belongs to nobody on HaalKhata, so the
  // sheet offers the caller's invite link instead of a dead refusal.
  const [notOnHaalKhata, setNotOnHaalKhata] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState<FriendsTab>("friends");
  const [settleWith, setSettleWith] = useState<{
    user: User;
    currency: string;
    cents: number;
  } | null>(null);

  /**
   * @param visible Whether the add-friend draft should be open; closed draft
   *   errors and a not-on-HaalKhata offer are discarded.
   */
  const changeAddSheet = (visible: boolean) => {
    setError("");
    setNotOnHaalKhata(false);
    setShowAdd(visible);
  };

  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });

  /** Refreshes the list and the tab badge, which counts incoming requests. */
  const refreshFriendsAndBadge = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  };

  /**
   * Sends a friend request. The server refuses an email or phone nobody on
   * HaalKhata has (FailedPrecondition); that refusal becomes the offer to
   * share the caller's invite link, shown in the sheet beside the field.
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
    onError: (mutationError, payload) => {
      if (isNotOnHaalKhata(mutationError, payload)) {
        setNotOnHaalKhata(true);
        return;
      }
      setError(errorMessage(mutationError));
    },
  });

  const [profileShareToken, setProfileShareToken] = useState("");

  /**
   * Fetches the caller's own profile link (minted on first ask) and opens
   * the share sheet with it. Whoever signs up through it sends the caller a
   * friend request, so the add sheet closes: its job is done.
   */
  const shareInviteLink = useMutation({
    mutationFn: async () => {
      const { token } = await socialClient.getProfileInviteLink({});
      return token;
    },
    onSuccess: (token) => {
      setNotOnHaalKhata(false);
      setContact(EMPTY_CONTACT);
      setShowAdd(false);
      setProfileShareToken(token);
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Accepts or declines one incoming friend request. */
  const respondToRequest = useMutation({
    mutationFn: (response: { userId: string; accept: boolean }) =>
      socialClient.respondFriendRequest(response),
    onSuccess: refreshFriendsAndBadge,
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

  const allFriends = useMemo(() => friends.data?.friends ?? [], [friends.data]);
  // Filtering keeps the server's order (people you have expenses with first,
  // then the rest alphabetically) rather than re-ranking by match quality.
  // Names only: a friend's email and phone are private and arrive empty.
  const visibleFriends = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return allFriends;
    return allFriends.filter((friend) => matchesTerms(terms, friend.user?.name));
  }, [allFriends, query]);

  // Headline totals, so the screen answers "where do I stand overall?"
  // before any individual row is read, per currency, never summed across.
  const currency = currentUser.data?.defaultCurrency || "USD";
  const totals = useMemo(
    () =>
      totalsByCurrency(
        allFriends.map((friend) => ({ balances: bucketsOf(friend, currency) })),
        currency,
      ),
    [allFriends, currency],
  );

  const pull = usePullToRefresh(() => friends.refetch());

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
    isLoading: friends.isLoading,
    refresh: pull.refresh,
    isRefreshing: pull.isRefreshing,
    showAdd,
    setShowAdd: changeAddSheet,
    contact,
    // The offer is about the contact that was refused; a new one starts over.
    setContact: (next: ContactDraft) => {
      setNotOnHaalKhata(false);
      setContact(next);
    },
    canSubmitAdd: !contactIsEmpty(contact),
    notOnHaalKhata,
    shareInviteLink: () => {
      setError("");
      shareInviteLink.mutate();
    },
    isSharingInviteLink: shareInviteLink.isPending,
    error,
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
    respondingAccept: respondToRequest.isPending && respondToRequest.variables?.accept === true,
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
    /** The open invite-link sheet's token; empty while closed. */
    profileShareToken,
    closeProfileShare: () => setProfileShareToken(""),
    /** Opens the OS share sheet with the profile link's message; for the sheet. */
    profileShareToSheet: () =>
      shareProfileInvite(profileShareToken, currentUser.data?.name ?? "A friend"),
    settleWith,
    setSettleWith,
  };
}

/** The controller object returned by {@link useFriends}, consumed by the screen and its tabs. */
export type FriendsController = ReturnType<typeof useFriends>;

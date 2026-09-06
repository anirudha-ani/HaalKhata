/** Composite hook for group detail: API plus tab, add-people, and settle state. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Code, ConnectError } from "@connectrpc/connect";
import { errorMessage, socialClient } from "@/lib/api/connect";
import { shareInvite } from "@/lib/invite/share";
import { useMutation } from "@tanstack/react-query";
import {
  contactIsEmpty,
  contactPayload,
  EMPTY_CONTACT,
  INVALID_PHONE_MESSAGE,
  type ContactDraft,
} from "@haalkhata/shared/phone/contact";
import { useGroupDetailAPI } from "./useGroupDetailAPI";

/** The tabs available on the group detail screen. */
export type GroupTab = "expenses" | "balances" | "activity";

/**
 * Combines the group detail API bindings with the screen's UI state: the
 * active tab, the add-people sheet form, the simplified-debts toggle, the
 * settle-up target, and a member lookup map.
 *
 * @param groupId - Identifier of the group being viewed.
 * @returns Everything from {@link useGroupDetailAPI} plus `tab`/`setTab`,
 *   `addingPeople`/`setAddingPeople` and the add-people form (`pickedIds`,
 *   `togglePicked`, `contact`/`setContact`, `submitPeople`,
 *   `peopleError`, `canAddPeople`), `candidates` (friends not already in the
 *   group), the members sheet (`viewingMembers`/`setViewingMembers`,
 *   `removeMember`, `removingUserId`, `transferOwnership`,
 *   `transferringUserId`, `memberError`, `requestFriendship`,
 *   `requestedIds`, `requestingUserId`, `friendIds`),
 *   `simplified`/`setSimplified`/`simplifyPending` for the group's
 *   persisted simplify-debts mode, `settleWith`/`setSettleWith` for the
 *   settle-up sheet, and `userById` mapping member ids to users.
 */
export function useGroupDetail(groupId: string) {
  const groupDetailAPI = useGroupDetailAPI(groupId);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<GroupTab>("expenses");
  const [addingPeople, setAddingPeople] = useState(false);
  const [viewingMembers, setViewingMembers] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [peopleError, setPeopleError] = useState("");
  const [memberError, setMemberError] = useState("");
  const [linkNotice, setLinkNotice] = useState("");
  // §33c: set when a typed contact has no claimed account, so the sheet
  // can offer "send them a sign-up invite?" instead of a dead error.
  const [inviteOffer, setInviteOffer] = useState<{ email: string; phone: string } | null>(null);
  // The server deliberately does not expose outgoing-request state, so this
  // local marker prevents accidental duplicate taps while the sheet is open.
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  // `received` rides along because the same sheet records both directions:
  // paying what you owe, and logging money that has arrived from someone who
  // owed you. Without it the group screen could only ever offer the first.
  const [settleWith, setSettleWith] = useState<{
    user: User;
    cents: number;
    received: boolean;
  } | null>(null);

  // Lookup map so panels can resolve a member's User from a bare user id.
  const userById = new Map(
    (groupDetailAPI.group?.members ?? []).flatMap((member) =>
      member.user ? [[member.user.id, member.user] as const] : [],
    ),
  );

  // Current members are not candidates — offering a checkbox that can only
  // produce "already in this group" is a control that exists to be refused.
  const candidates = groupDetailAPI.friends.filter((friend) => !userById.has(friend.id));

  /** Adds or removes somebody from the pending selection. */
  const togglePicked = (userId: string) => {
    setPickedIds((current) =>
      current.includes(userId)
        ? current.filter((pickedId) => pickedId !== userId)
        : [...current, userId],
    );
  };

  /** Adds the checked people plus the typed email/phone, then closes the sheet. */
  const submitPeople = () => {
    setPeopleError("");
    setInviteOffer(null);
    const payload = contactPayload(contact);
    // A number that cannot exist in the selected country never leaves the
    // form; the server's generic denial is reserved for real lookups.
    if (payload === null) {
      setPeopleError(INVALID_PHONE_MESSAGE);
      return;
    }
    groupDetailAPI.addMembers.mutate(
      { userIds: pickedIds, ...payload },
      {
        onSuccess: () => {
          setPickedIds([]);
          setContact(EMPTY_CONTACT);
          setAddingPeople(false);
        },
        onError: (mutationError) => {
          // §33c: the not-on-platform refusal becomes the invite offer.
          if (
            mutationError instanceof ConnectError &&
            mutationError.code === Code.FailedPrecondition &&
            (payload.email !== "" || payload.phone !== "")
          ) {
            setInviteOffer(payload);
            return;
          }
          setPeopleError(errorMessage(mutationError));
        },
      },
    );
  };

  const [signUpShare, setSignUpShare] = useState<{ token: string; contact: string } | null>(
    null,
  );

  /**
   * Sends the sign-up invite the §33c offer promised, then opens the share
   * dialog (QR code, copy, share sheet) with its claim link. The add-people
   * sheet closes first — two native modals cannot stack.
   */
  const sendSignUpInvite = useMutation({
    mutationFn: async (offer: { email: string; phone: string }) => {
      const { token } = await socialClient.inviteContactToSignUp(offer);
      return { token, contact: offer.email || offer.phone };
    },
    onSuccess: (share) => {
      setInviteOffer(null);
      setContact(EMPTY_CONTACT);
      setAddingPeople(false);
      setSignUpShare(share);
    },
    onError: (mutationError) => setPeopleError(errorMessage(mutationError)),
  });

  const [groupShareToken, setGroupShareToken] = useState("");

  /**
   * Fetches the group's one join link (minted on first ask) and opens the
   * share dialog, which owns the QR code, the copy button, and the OS
   * share sheet.
   */
  const shareGroupLink = useMutation({
    mutationFn: async () => {
      const { token } = await socialClient.createGroupInviteLink({ groupId });
      return token;
    },
    onSuccess: (token) => setGroupShareToken(token),
    onError: (mutationError) => setPeopleError(errorMessage(mutationError)),
  });

  /** Owner-only: turns the shared link off; the next share mints a fresh one. */
  const resetLink = useMutation({
    mutationFn: () => socialClient.revokeGroupInviteLink({ groupId }),
    onSuccess: () => setLinkNotice("Invite link turned off — sharing again makes a new one"),
    onError: (mutationError) => setMemberError(errorMessage(mutationError)),
  });

  /** Shares an Invited member's personal sign-up link. */
  const remind = useMutation({
    mutationFn: async (person: User) => {
      const { token } = await socialClient.getFriendInviteLink({ userId: person.id });
      return shareInvite(
        token,
        groupDetailAPI.me?.name ?? "A member",
        groupDetailAPI.group?.name ?? "",
      );
    },
    onSuccess: (outcome) => {
      if (outcome === "shared") setLinkNotice("Invite link shared ✓");
    },
    onError: (mutationError) => setMemberError(errorMessage(mutationError)),
  });

  /**
   * Removes one member — the caller's own id means leaving. The zero-balance
   * gate lives on the server, whose message is the honest one to show; a
   * successful leave navigates away, since this screen is no longer the
   * caller's to see.
   *
   * @param userId - The member to remove.
   */
  const removeMember = (userId: string) => {
    setMemberError("");
    groupDetailAPI.removeMember.mutate(userId, {
      onSuccess: () => {
        if (userId === groupDetailAPI.me?.id) {
          setViewingMembers(false);
          router.replace("/groups");
        }
      },
      onError: (mutationError) => setMemberError(errorMessage(mutationError)),
    });
  };

  /**
   * Makes another member the owner. The server's refusals (not the owner,
   * not a member) are shown in the members sheet.
   *
   * @param userId - The member who becomes the owner.
   */
  const transferOwnership = (userId: string) => {
    setMemberError("");
    groupDetailAPI.transferOwnership.mutate(userId, {
      onError: (mutationError) => setMemberError(errorMessage(mutationError)),
    });
  };

  /**
   * Sends a friend request to a member who is not yet a friend; the row
   * shows "Requested" afterwards so it cannot be sent twice from here.
   *
   * @param userId - The member to befriend.
   */
  const requestFriendship = (userId: string) => {
    setMemberError("");
    groupDetailAPI.addFriend.mutate(userId, {
      onSuccess: () => setRequestedIds((current) => [...current, userId]),
      onError: (mutationError) => setMemberError(errorMessage(mutationError)),
    });
  };

  return {
    ...groupDetailAPI,
    tab: activeTab,
    setTab: setActiveTab,
    addingPeople,
    setAddingPeople,
    viewingMembers,
    setViewingMembers,
    removeMember,
    removingUserId: groupDetailAPI.removeMember.isPending
      ? groupDetailAPI.removeMember.variables
      : undefined,
    transferOwnership,
    transferringUserId: groupDetailAPI.transferOwnership.isPending
      ? groupDetailAPI.transferOwnership.variables
      : undefined,
    memberError,
    linkNotice,
    shareInviteLink: () => {
      setLinkNotice("");
      shareGroupLink.mutate();
    },
    sharingInviteLink: shareGroupLink.isPending,
    /** Token behind the open share dialog; empty while it is closed. */
    groupShareToken,
    closeGroupShare: () => setGroupShareToken(""),
    /** Opens the OS share sheet with the link's message; for the dialog. */
    shareLinkToSheet: () =>
      shareInvite(
        groupShareToken,
        groupDetailAPI.me?.name ?? "A member",
        groupDetailAPI.group?.name ?? "a group",
      ),
    resetInviteLink: () => {
      setMemberError("");
      resetLink.mutate();
    },
    resettingInviteLink: resetLink.isPending,
    remindMember: (person: User) => {
      setMemberError("");
      remind.mutate(person);
    },
    remindingUserId: remind.isPending ? remind.variables?.id : undefined,
    requestFriendship,
    requestedIds,
    requestingUserId: groupDetailAPI.addFriend.isPending
      ? groupDetailAPI.addFriend.variables
      : undefined,
    // Ids the caller already has a friendship with, so the members sheet can
    // tell "open our ledger" from "ask to be friends".
    friendIds: new Set(groupDetailAPI.friends.map((friend) => friend.id)),
    candidates,
    pickedIds,
    togglePicked,
    contact,
    setContact,
    peopleError,
    inviteOffer,
    sendSignUpInvite: () => {
      if (inviteOffer) sendSignUpInvite.mutate(inviteOffer);
    },
    sendingSignUpInvite: sendSignUpInvite.isPending,
    /** The open sign-up share dialog's link and contact; null while closed. */
    signUpShare,
    closeSignUpShare: () => setSignUpShare(null),
    /** Opens the OS share sheet with the link's message; for the dialog. */
    signUpShareToSheet: () =>
      shareInvite(signUpShare?.token ?? "", groupDetailAPI.me?.name ?? "A member", ""),
    dismissInviteOffer: () => setInviteOffer(null),
    submitPeople,
    canAddPeople: pickedIds.length > 0 || !contactIsEmpty(contact),
    // The persisted group mode, not view state: everyone in the group sees
    // the same debts, and the server's settlement guards follow the same
    // switch. (A cached Group from before the field existed simply lacks it —
    // undefined reads as off until the refetch lands.)
    simplified: groupDetailAPI.group?.simplifyDebts ?? false,
    setSimplified: (value: boolean) => groupDetailAPI.setSimplify.mutate(value),
    simplifyPending: groupDetailAPI.setSimplify.isPending,
    settleWith,
    setSettleWith,
    userById,
  };
}

"use client";
/** Composite hook for group detail: API plus tab, add-people, and settle state. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
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
import type { MemberFeedback } from "@haalkhata/shared/group/memberActions";
import { GroupStatus, type GroupArchiveStatus } from "@haalkhata/shared/group/status";
import { groupArchivePrompt } from "@haalkhata/shared/group/archivePrompt";
import { groupBalanceSections } from "@haalkhata/shared/group/currencyBalances";
import { useGroupDetailAPI } from "./useGroupDetailAPI";

/** The tabs available on the group detail page. */
export type GroupTab = "expenses" | "balances" | "activity";

/**
 * Combines the group detail API bindings with the page's UI state: the active
 * tab, the add-people modal form, the simplified-debts toggle, the settle-up
 * target, and a member lookup map.
 *
 * @param groupId - Identifier of the group being viewed.
 * @returns Everything from {@link useGroupDetailAPI} plus `tab`/`setTab`,
 *   `addingPeople`/`setAddingPeople` and the add-people form (`pickedIds`,
 *   `togglePicked`, `contact`/`setContact`, `submitPeople`,
 *   `peopleError`, `canAddPeople`), `candidates` (friends not already in the
 *   group), `reportingGroup`/`setReportingGroup` for the report modal the
 *   group menu opens, the members modal (`viewingMembers`/`setViewingMembers`,
 *   `removeMember`, `removingUserId`, `transferOwnership`,
 *   `transferringUserId`, and `memberFeedback`, the last failure or
 *   confirmation from an action in that modal and the row it belongs to),
 *   `linkError` for a failed invite-link share,
 *   `simplified`/`setSimplified`/`simplifyPending`/`simplifyError` for the
 *   group's persisted simplify-debts mode, `settleWith`/`setSettleWith` for the
 *   settle-up modal, and `userById` mapping member ids to users.
 */
export function useGroupDetail(groupId: string) {
  const groupDetailAPI = useGroupDetailAPI(groupId);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<GroupTab>("expenses");
  const [addingPeople, setAddingPeople] = useState(false);
  const [viewingMembers, setViewingMembers] = useState(false);
  const [reportingGroup, setReportingGroup] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [peopleError, setPeopleError] = useState("");
  // Nothing an action in the members modal does may fail silently: the
  // message is kept with the row it is about, so it shows where the tap was.
  const [memberFeedback, setMemberFeedback] = useState<MemberFeedback | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [archiveAction, setArchiveAction] = useState<{ groupId: string; status: GroupArchiveStatus } | null>(null);
  const pendingGroupStatus = archiveAction?.groupId === groupId ? archiveAction.status : null;
  const [linkNotice, setLinkNotice] = useState("");
  const [linkError, setLinkError] = useState("");
  // §33c: set when a typed contact belongs to nobody on HaalKhata, so the
  // modal offers the group's invite link instead of a dead error.
  const [inviteOffer, setInviteOffer] = useState<{ email: string; phone: string } | null>(null);
  // `received` rides along because the same modal records both directions:
  // paying what you owe, and logging money that has arrived from someone who
  // owed you. Without it the group page could only ever offer the first.
  const [settleWith, setSettleWith] = useState<{
    user: User;
    cents: number;
    received: boolean;
    /** The currency of the balance the action sat beside. */
    currency: string;
  } | null>(null);

  // The group's balances one currency at a time, its own first. Every view of
  // them — the panel, the archive check, the members list — reads these, so
  // a balance in a second currency is never left out of one of them.
  const balanceSections = groupDetailAPI.balances
    ? groupBalanceSections(groupDetailAPI.balances, groupDetailAPI.group?.currency ?? "USD")
    : undefined;

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

  /** Adds the checked people plus the typed email/phone, then closes the modal. */
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
          // §33c: the not-on-HaalKhata refusal becomes the invite-link offer.
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

  const [groupShareToken, setGroupShareToken] = useState("");
  // When the shared link stops working, for the dialog to say.
  const [groupShareExpiresAt, setGroupShareExpiresAt] = useState("");

  /**
   * Fetches the group's one join link (minted on first ask) and opens the
   * share dialog, which owns the QR code, the copy button, and the OS share
   * sheet. Anyone with the link sees who invited them to what before
   * accepting; a stranger joining this way is the consent path §33 gives
   * non-friends, and the way in for somebody not on HaalKhata yet.
   */
  const shareGroupLink = useMutation({
    mutationFn: async () => {
      const { token, expiresAt } = await socialClient.createGroupInviteLink({ groupId });
      return { token, expiresAt };
    },
    onSuccess: (link) => {
      setGroupShareToken(link.token);
      setGroupShareExpiresAt(link.expiresAt);
    },
    // Shown under the strip the button sits in. It used to go to the
    // add-people form's error, which is only on screen inside a modal that
    // is closed when this runs (the §33c offer closes it before sharing).
    onError: (mutationError) => {
      setLinkNotice("");
      setLinkError(errorMessage(mutationError));
    },
  });

  /** Owner-only: turns the shared link off; the next share mints a fresh one. */
  const resetInviteLink = useMutation({
    mutationFn: () => socialClient.revokeGroupInviteLink({ groupId }),
    // Said in the modal, where the button is, and left on the page for when
    // the modal closes.
    onSuccess: () => {
      const message = "Invite link turned off — sharing again makes a new one";
      setLinkNotice(message);
      setMemberFeedback({ userId: null, tone: "success", message });
    },
    onError: (mutationError) =>
      setMemberFeedback({ userId: null, tone: "error", message: errorMessage(mutationError) }),
  });

  /**
   * Removes one member — the caller's own id means leaving. The zero-balance
   * gate lives on the server; the modal explains it up front from the
   * balances it already has, and a refusal that still comes back (a stale
   * page, a new expense in between) is shown on that person's row. A
   * successful leave navigates away, since this page is no longer the
   * caller's to see.
   *
   * @param userId - The member to remove.
   */
  const removeMember = (userId: string) => {
    setMemberFeedback(null);
    groupDetailAPI.removeMember.mutate(userId, {
      onSuccess: () => {
        if (userId === groupDetailAPI.me?.id) {
          setViewingMembers(false);
          router.push("/groups");
        }
      },
      onError: (mutationError) =>
        setMemberFeedback({ userId, tone: "error", message: errorMessage(mutationError) }),
    });
  };

  /**
   * Makes another member the owner. The server's refusals (not the owner,
   * not a member) are shown on that member's row in the members modal.
   *
   * @param userId - The member who becomes the owner.
   */
  const transferOwnership = (userId: string) => {
    setMemberFeedback(null);
    groupDetailAPI.transferOwnership.mutate(userId, {
      onError: (mutationError) =>
        setMemberFeedback({ userId, tone: "error", message: errorMessage(mutationError) }),
    });
  };

  const archivePrompt = pendingGroupStatus === null ? null : groupArchivePrompt({
    groupName: groupDetailAPI.group?.name ?? "this group",
    status: pendingGroupStatus,
    balances: balanceSections,
  });

  /**
   * Opens the explanation or confirmation without changing the group.
   *
   * @returns No value; the pending action opens its popup.
   */
  const openArchiveDialog = () => {
    setArchiveError("");
    setArchiveAction({
      groupId,
      status: groupDetailAPI.group?.status === GroupStatus.ARCHIVED ? GroupStatus.ACTIVE : GroupStatus.ARCHIVED,
    });
  };

  /**
   * Dismisses the popup; a pending mutation keeps its feedback visible.
   *
   * @returns No value; the pending action is cleared when idle.
   */
  const closeArchiveDialog = () => {
    if (groupDetailAPI.setStatus.isPending) return;
    setArchiveAction(null);
    setArchiveError("");
  };

  /**
   * Saves the state the user confirmed, retaining any server refusal in the popup.
   *
   * @returns No value; the mutation closes the popup only after success.
   */
  const confirmArchiveChange = () => {
    if (pendingGroupStatus === null || !archivePrompt?.confirmLabel || groupDetailAPI.setStatus.isPending) return;
    setArchiveError("");
    groupDetailAPI.setStatus.mutate(pendingGroupStatus, {
      onSuccess: () => setArchiveAction(null),
      onError: (mutationError) => setArchiveError(errorMessage(mutationError)),
    });
  };

  return {
    ...groupDetailAPI,
    archivePrompt,
    archiveError,
    archivePending: groupDetailAPI.setStatus.isPending,
    openArchiveDialog,
    closeArchiveDialog,
    confirmArchiveChange,
    /** Opens the balances tab from a blocked archive explanation. */
    viewArchiveBalances: () => {
      closeArchiveDialog();
      setActiveTab("balances");
    },
    tab: activeTab,
    setTab: setActiveTab,
    addingPeople,
    setAddingPeople,
    reportingGroup,
    setReportingGroup,
    viewingMembers,
    /** Opens or closes the members modal; what it last said goes with it. */
    setViewingMembers: (open: boolean) => {
      setMemberFeedback(null);
      setViewingMembers(open);
    },
    removeMember,
    removingUserId: groupDetailAPI.removeMember.isPending
      ? groupDetailAPI.removeMember.variables
      : undefined,
    transferOwnership,
    transferringUserId: groupDetailAPI.transferOwnership.isPending
      ? groupDetailAPI.transferOwnership.variables
      : undefined,
    memberFeedback,
    linkNotice,
    linkError,
    shareInviteLink: () => {
      setLinkNotice("");
      setLinkError("");
      shareGroupLink.mutate();
    },
    sharingInviteLink: shareGroupLink.isPending,
    /** Token behind the open share dialog; empty while it is closed. */
    groupShareToken,
    groupShareExpiresAt,
    closeGroupShare: () => setGroupShareToken(""),
    /** Opens the OS share sheet with the link's message; for the dialog. */
    shareLinkToSheet: () =>
      shareInvite(
        groupShareToken,
        groupDetailAPI.me?.name ?? "A member",
        groupDetailAPI.group?.name ?? "a group",
      ),
    resetInviteLink: () => {
      setMemberFeedback(null);
      resetInviteLink.mutate();
    },
    resettingInviteLink: resetInviteLink.isPending,
    candidates,
    pickedIds,
    togglePicked,
    contact,
    setContact,
    peopleError,
    inviteOffer,
    /**
     * Answers the §33c offer: closes the add-people modal, so the share
     * dialog and any failure under the link strip are on screen, and shares
     * the group's join link.
     */
    shareLinkFromOffer: () => {
      setInviteOffer(null);
      setContact(EMPTY_CONTACT);
      setAddingPeople(false);
      setLinkNotice("");
      setLinkError("");
      shareGroupLink.mutate();
    },
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
    /** Why the last flip of the mode did not take; "" when it did. Cleared by the next attempt. */
    simplifyError: groupDetailAPI.setSimplify.isError
      ? errorMessage(groupDetailAPI.setSimplify.error)
      : "",
    balanceSections,
    settleWith,
    setSettleWith,
    userById,
  };
}

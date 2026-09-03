"use client";
/** Composite hook for group detail: API plus tab, add-people, and settle state. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
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
 *   group), the members modal (`viewingMembers`/`setViewingMembers`,
 *   `removeMember`, `removingUserId`, `transferOwnership`,
 *   `transferringUserId`, `memberError`),
 *   `simplified`/`setSimplified`/`simplifyPending` for the group's
 *   persisted simplify-debts mode, `settleWith`/`setSettleWith` for the
 *   settle-up modal, and `userById` mapping member ids to users.
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
  // `received` rides along because the same modal records both directions:
  // paying what you owe, and logging money that has arrived from someone who
  // owed you. Without it the group page could only ever offer the first.
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

  /** Adds the checked people plus the typed email/phone, then closes the modal. */
  const submitPeople = () => {
    setPeopleError("");
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
        onError: (mutationError) => setPeopleError(errorMessage(mutationError)),
      },
    );
  };

  /**
   * Shares the group's one join link (minted on first ask) through the OS
   * share sheet. Anyone with the link sees who invited them to what before
   * accepting; a stranger joining this way is the consent path §33 gives
   * registered non-friends.
   */
  const shareGroupLink = useMutation({
    mutationFn: async () => {
      const { token } = await socialClient.createGroupInviteLink({ groupId });
      return shareInvite(
        token,
        groupDetailAPI.me?.name ?? "A member",
        groupDetailAPI.group?.name ?? "a group",
      );
    },
    onSuccess: (outcome) =>
      setLinkNotice(outcome === "copied" ? "Invite link copied ✓" : "Invite link shared ✓"),
    onError: (mutationError) => {
      if (mutationError instanceof Error && mutationError.name === "AbortError") return;
      setLinkNotice("");
      setPeopleError(errorMessage(mutationError));
    },
  });

  /** Owner-only: turns the shared link off; the next share mints a fresh one. */
  const resetInviteLink = useMutation({
    mutationFn: () => socialClient.revokeGroupInviteLink({ groupId }),
    onSuccess: () => setLinkNotice("Invite link turned off — sharing again makes a new one"),
    onError: (mutationError) => setMemberError(errorMessage(mutationError)),
  });

  /** Shares an Invited member's personal sign-up link. */
  const remindMember = useMutation({
    mutationFn: async (person: User) => {
      const { token } = await socialClient.getFriendInviteLink({ userId: person.id });
      return shareInvite(
        token,
        groupDetailAPI.me?.name ?? "A member",
        groupDetailAPI.group?.name ?? "",
      );
    },
    onSuccess: (outcome) =>
      setLinkNotice(outcome === "copied" ? "Invite link copied ✓" : "Invite link shared ✓"),
    onError: (mutationError) => {
      if (mutationError instanceof Error && mutationError.name === "AbortError") return;
      setMemberError(errorMessage(mutationError));
    },
  });

  /**
   * Removes one member — the caller's own id means leaving. The zero-balance
   * gate lives on the server, whose message is the honest one to show; a
   * successful leave navigates away, since this page is no longer the
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
          router.push("/groups");
        }
      },
      onError: (mutationError) => setMemberError(errorMessage(mutationError)),
    });
  };

  /**
   * Makes another member the owner. The server's refusals (not the owner,
   * not a member) are shown in the members modal.
   *
   * @param userId - The member who becomes the owner.
   */
  const transferOwnership = (userId: string) => {
    setMemberError("");
    groupDetailAPI.transferOwnership.mutate(userId, {
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
    resetInviteLink: () => {
      setMemberError("");
      resetInviteLink.mutate();
    },
    resettingInviteLink: resetInviteLink.isPending,
    remindMember: (person: User) => {
      setMemberError("");
      remindMember.mutate(person);
    },
    remindingUserId: remindMember.isPending ? remindMember.variables?.id : undefined,
    candidates,
    pickedIds,
    togglePicked,
    contact,
    setContact,
    peopleError,
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

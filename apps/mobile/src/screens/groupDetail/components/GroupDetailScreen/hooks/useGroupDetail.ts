/** Composite hook for group detail: API plus tab, add-people, and settle state. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import { useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import { splitIdentifier } from "@haalkhata/shared/auth/identifier";
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
 *   `togglePicked`, `identifier`/`setIdentifier`, `submitPeople`,
 *   `peopleError`, `canAddPeople`), `candidates` (friends not already in the
 *   group), the members sheet (`viewingMembers`/`setViewingMembers`,
 *   `removeMember`, `removingUserId`, `transferOwnership`,
 *   `transferringUserId`, `memberError`),
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
  const [identifier, setIdentifier] = useState("");
  const [peopleError, setPeopleError] = useState("");
  const [memberError, setMemberError] = useState("");
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
    const trimmed = identifier.trim();
    groupDetailAPI.addMembers.mutate(
      {
        userIds: pickedIds,
        ...(trimmed === "" ? { email: "", phone: "" } : splitIdentifier(trimmed)),
      },
      {
        onSuccess: () => {
          setPickedIds([]);
          setIdentifier("");
          setAddingPeople(false);
        },
        onError: (mutationError) => setPeopleError(errorMessage(mutationError)),
      },
    );
  };

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
    candidates,
    pickedIds,
    togglePicked,
    identifier,
    setIdentifier,
    peopleError,
    submitPeople,
    canAddPeople: pickedIds.length > 0 || identifier.trim() !== "",
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

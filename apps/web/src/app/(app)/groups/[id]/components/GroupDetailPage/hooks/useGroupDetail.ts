"use client";
/** Composite hook for group detail: API plus tab, invite, and settle state. */

import { useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage } from "@/lib/api/connect";
import { useGroupDetailAPI } from "./useGroupDetailAPI";

/** The two tabs available on the group detail page. */
export type GroupTab = "expenses" | "balances";

/**
 * Combines the group detail API bindings with the page's UI state: the active
 * tab, the invite-member modal form, the simplified-debts toggle, the
 * settle-up target, and a member lookup map.
 *
 * @param groupId - Identifier of the group being viewed.
 * @returns Everything from {@link useGroupDetailAPI} plus `tab`/`setTab`,
 *   `addingMember`/`setAddingMember` and the `memberEmail` invite form with
 *   `submitMember` and `memberError`, `simplified`/`setSimplified` for the
 *   debts view, `settleWith`/`setSettleWith` for the settle-up modal, and
 *   `userById` mapping member ids to users.
 */
export function useGroupDetail(groupId: string) {
  const groupDetailAPI = useGroupDetailAPI(groupId);
  const [activeTab, setActiveTab] = useState<GroupTab>("expenses");
  const [addingMember, setAddingMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberError, setMemberError] = useState("");
  const [simplified, setSimplified] = useState(false);
  const [settleWith, setSettleWith] = useState<{ user: User; cents: number } | null>(null);

  /** Invites the typed email as a member; on success clears and closes the modal. */
  const submitMember = () => {
    setMemberError("");
    groupDetailAPI.addMember.mutate(
      { email: memberEmail, name: "" },
      {
        onSuccess: () => {
          setMemberEmail("");
          setAddingMember(false);
        },
        onError: (mutationError) => setMemberError(errorMessage(mutationError)),
      },
    );
  };

  // Lookup map so panels can resolve a member's User from a bare user id.
  const userById = new Map(
    (groupDetailAPI.group?.members ?? []).flatMap((member) =>
      member.user ? [[member.user.id, member.user] as const] : [],
    ),
  );

  return {
    ...groupDetailAPI,
    tab: activeTab,
    setTab: setActiveTab,
    addingMember,
    setAddingMember,
    memberEmail,
    setMemberEmail,
    memberError,
    submitMember,
    simplified,
    setSimplified,
    settleWith,
    setSettleWith,
    userById,
  };
}

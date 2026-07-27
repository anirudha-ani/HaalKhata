/** Composite hook for the groups screen: API plus create-group form state and navigation. */

import { useRouter } from "expo-router";
import { useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import { useGroupsAPI } from "./useGroupsAPI";

/**
 * Combines the groups API bindings with the new-group sheet's form state and
 * post-create navigation to the new group's detail screen.
 *
 * @returns Everything from {@link useGroupsAPI} plus `creating`/`setCreating`
 *   (sheet visibility), the `name`/`type`/`currency` form fields with setters,
 *   `memberIds`/`toggleMember` for the people picked to join at creation, the
 *   last create `error` message, `submitCreate` to run the mutation, and
 *   `isCreating` while it is pending.
 */
export function useGroups() {
  const groupsAPI = useGroupsAPI();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("trip");
  const [currency, setCurrency] = useState("USD");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  /** Adds or removes somebody from the set enrolled when the group is created. */
  const toggleMember = (userId: string) => {
    setMemberIds((current) =>
      current.includes(userId)
        ? current.filter((memberId) => memberId !== userId)
        : [...current, userId],
    );
  };

  /** Creates the group; on success closes the sheet and navigates to its detail screen. */
  const submitCreate = () => {
    setError("");
    groupsAPI.createGroup.mutate(
      { name, type, currency, memberIds },
      {
        onSuccess: (group) => {
          setCreating(false);
          setName("");
          setMemberIds([]);
          router.push(`/groups/${group.id}`);
        },
        onError: (mutationError) => setError(errorMessage(mutationError)),
      },
    );
  };

  return {
    ...groupsAPI,
    creating,
    setCreating,
    name,
    setName,
    type,
    setType,
    currency,
    setCurrency,
    memberIds,
    toggleMember,
    error,
    submitCreate,
    isCreating: groupsAPI.createGroup.isPending,
  };
}

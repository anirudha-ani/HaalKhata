"use client";
/** Composite hook for the groups route: API plus create-group form state and navigation. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/api/connect";
import { useGroupsAPI } from "./useGroupsAPI";

/**
 * Combines the groups API bindings with the new-group modal's form state and
 * post-create navigation to the new group's detail page.
 *
 * @returns Everything from {@link useGroupsAPI} plus `creating`/`setCreating`
 *   (modal visibility), the `name`/`type`/`currency` form fields with setters,
 *   the last create `error` message, `submitCreate` to run the mutation, and
 *   `isCreating` while it is pending.
 */
export function useGroups() {
  const groupsAPI = useGroupsAPI();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("trip");
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState("");

  /** Creates the group; on success closes the modal and navigates to its detail page. */
  const submitCreate = () => {
    setError("");
    groupsAPI.createGroup.mutate(
      { name, type, currency },
      {
        onSuccess: (group) => {
          setCreating(false);
          setName("");
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
    error,
    submitCreate,
    isCreating: groupsAPI.createGroup.isPending,
  };
}

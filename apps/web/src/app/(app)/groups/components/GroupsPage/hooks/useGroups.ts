"use client";
/** Composite hook for the groups route: API plus create-group form state and navigation. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/api/connect";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { useGroupsAPI } from "./useGroupsAPI";

/**
 * Combines the groups API bindings with the new-group modal's form state and
 * post-create navigation to the new group's detail page.
 *
 * @returns Everything from {@link useGroupsAPI} plus `visibleGroups` (those
 *   matching `query`) and the `query`/`setQuery` search state,
 *   `creating`/`setCreating` (modal visibility), the `name`/`type`/`currency`
 *   form fields with setters, `memberIds`/`toggleMember` for the people picked
 *   to join at creation, the last create `error` message, `submitCreate` to
 *   run the mutation, and `isCreating` while it is pending.
 */
export function useGroups() {
  const groupsAPI = useGroupsAPI();
  const router = useRouter();
  const [query, setQuery] = useState("");
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

  /** Creates the group; on success closes the modal and navigates to its detail page. */
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

  // Group type is searchable too, so "trip" pulls up every trip at once.
  const visibleGroups = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return groupsAPI.groups;
    return groupsAPI.groups.filter((summary) =>
      matchesTerms(terms, summary.group?.name, summary.group?.type),
    );
  }, [groupsAPI.groups, query]);

  return {
    ...groupsAPI,
    visibleGroups,
    query,
    setQuery,
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

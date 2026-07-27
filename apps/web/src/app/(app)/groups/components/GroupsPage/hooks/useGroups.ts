"use client";
/** Composite hook for the groups route: API plus create-group form state and navigation. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/api/connect";
import { matchesTerms, searchTerms } from "@/lib/search/filter";
import { useGroupsAPI } from "./useGroupsAPI";

/**
 * Combines the groups API bindings with the new-group modal's form state and
 * post-create navigation to the new group's detail page.
 *
 * @returns Everything from {@link useGroupsAPI} plus `visibleGroups` (those
 *   matching `query`) and the `query`/`setQuery` search state,
 *   `creating`/`setCreating` (modal visibility), the `name`/`type`/`currency`
 *   form fields with setters, the last create `error` message, `submitCreate`
 *   to run the mutation, and `isCreating` while it is pending.
 */
export function useGroups() {
  const groupsAPI = useGroupsAPI();
  const router = useRouter();
  const [query, setQuery] = useState("");
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
    error,
    submitCreate,
    isCreating: groupsAPI.createGroup.isPending,
  };
}

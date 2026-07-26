"use client";
/** TanStack Query bindings for the groups route: list groups, create group. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Wraps every server call the groups page makes: the group-list query and the
 * create-group mutation (which invalidates the list on success).
 *
 * @returns An object with `groups` (group summaries, empty while loading),
 *   `isLoading` for the list query, and the `createGroup` mutation.
 */
export function useGroupsAPI() {
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });
  const createGroup = useMutation({
    mutationFn: (input: { name: string; type: string; currency: string }) =>
      groupClient.createGroup(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
  });
  return { groups: groups.data?.groups ?? [], isLoading: groups.isLoading, createGroup };
}

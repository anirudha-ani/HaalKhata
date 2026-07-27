/** TanStack Query bindings for the groups screen: list groups, list friends, create group. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupClient, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Wraps every server call the groups screen makes: the group-list query, the
 * friends query backing the new-group member picker, and the create-group
 * mutation (which invalidates the list on success).
 *
 * @returns An object with `groups` (group summaries, empty while loading),
 *   `friends` (users available to enrol at creation), `isLoading` for the list
 *   query, `refresh`/`isRefreshing` for pull-to-refresh, and the `createGroup`
 *   mutation.
 */
export function useGroupsAPI() {
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });
  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });
  const createGroup = useMutation({
    mutationFn: (input: { name: string; type: string; currency: string; memberIds: string[] }) =>
      groupClient.createGroup(input),
    // Enrolling people makes them friends, so the friends list can change too.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups });
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
  });
  return {
    groups: groups.data?.groups ?? [],
    friends: (friends.data?.friends ?? []).flatMap((friend) => (friend.user ? [friend.user] : [])),
    isLoading: groups.isLoading,
    refresh: () => void groups.refetch(),
    isRefreshing: groups.isRefetching,
    createGroup,
  };
}

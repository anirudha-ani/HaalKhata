"use client";
/** Account data: the getMe query for the signed-in user. */

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Fetches the signed-in user via the getMe query.
 *
 * @returns `me` (the current user, or undefined while loading) and `isLoading`.
 */
export function useAccountAPI() {
  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  // isPending, not isLoading: isLoading stays true for any fetch, so a
  // background refetch after save would swap the whole form for a spinner and
  // remount it — losing every unsaved keystroke. isPending is true only when
  // there is no data at all, which is the one time a spinner is honest.
  return { me: currentUserQuery.data, isLoading: currentUserQuery.isPending };
}

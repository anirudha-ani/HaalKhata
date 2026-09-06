/** Dashboard queries: me, overall balances, groups, recent activity. */

import { useQuery } from "@tanstack/react-query";
import { authClient, expenseClient, groupClient, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Fetches everything the dashboard needs: the signed-in user, overall
 * balances across all groups/friends, the group list, and the activity feed.
 *
 * @returns `me` (current user), `balances` (overall balance summary) with
 *   `balancesError` when that query failed, `groups` (group summaries),
 *   `recentActivity` (up to six newest activity events), `isLoading` (true
 *   until both the user and balances have loaded), and
 *   `refresh`/`isRefreshing` for pull-to-refresh.
 */
export function useDashboardAPI() {
  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  const balancesQuery = useQuery({
    queryKey: queryKeys.overallBalances,
    queryFn: () => expenseClient.getOverallBalances({}),
  });
  // Same key as the groups screen, so arriving here warms that list and
  // coming back from it costs nothing.
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });
  const activityQuery = useQuery({
    queryKey: queryKeys.activity(),
    queryFn: () => socialClient.listActivity({ groupId: "" }),
  });

  /** Refetches every dashboard query (pull-to-refresh). */
  const refresh = () => {
    void currentUserQuery.refetch();
    void balancesQuery.refetch();
    void groupsQuery.refetch();
    void activityQuery.refetch();
  };

  return {
    me: currentUserQuery.data,
    balances: balancesQuery.data,
    // Surfaced rather than swallowed: the overall-balance RPC is rate-limited
    // per account, and a refused call must not render as "you owe nothing".
    balancesError: balancesQuery.error,
    groups: groupsQuery.data?.groups ?? [],
    recentActivity: activityQuery.data?.events.slice(0, 6) ?? [],
    // Deliberately not gated on the groups or activity queries: those
    // sections render only once they have rows, so waiting on them would
    // hold back the balances that are the point of the screen.
    isLoading: currentUserQuery.isLoading || balancesQuery.isLoading,
    refresh,
    isRefreshing:
      currentUserQuery.isRefetching || balancesQuery.isRefetching || activityQuery.isRefetching,
  };
}

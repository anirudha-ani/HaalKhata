"use client";
/** Dashboard queries: me, overall balances, recent activity. */

import { useQuery } from "@tanstack/react-query";
import { authClient, expenseClient, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@/lib/api/queryKeys";

/**
 * Fetches everything the dashboard needs: the signed-in user, overall
 * balances across all groups/friends, and the activity feed.
 *
 * @returns `me` (current user), `balances` (overall balance summary),
 *   `recentActivity` (up to six newest activity events), and `isLoading`
 *   (true until both the user and balances have loaded).
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
  const activityQuery = useQuery({
    queryKey: queryKeys.activity(),
    queryFn: () => socialClient.listActivity({ groupId: "" }),
  });
  return {
    me: currentUserQuery.data,
    balances: balancesQuery.data,
    recentActivity: activityQuery.data?.events.slice(0, 6) ?? [],
    isLoading: currentUserQuery.isLoading || balancesQuery.isLoading,
  };
}

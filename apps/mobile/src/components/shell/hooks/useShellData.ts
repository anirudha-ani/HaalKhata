/** Data hook for the app shell: signed-in user profile + unread notification count. */

import { useQuery } from "@tanstack/react-query";
import { authClient, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Fetches the data the shell chrome needs: the signed-in user's profile and
 * the unread notification count (polled every 30 seconds while foregrounded).
 *
 * @returns An object with `currentUser` (undefined while loading) and `unreadCount`.
 */
export function useShellData() {
  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => socialClient.listNotifications({}),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  return {
    currentUser: currentUserQuery.data,
    unreadCount: notificationsQuery.data?.unreadCount ?? 0,
  };
}

"use client";
/** Data hook for the app shell: signed-in user profile, unread notification count, pending friend requests. */

import { useQuery } from "@tanstack/react-query";
import { authClient, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Fetches the data the shell chrome needs: the signed-in user's profile and,
 * polled every 30 seconds, the unread notification count together with the
 * number of friend requests awaiting the user's answer.
 *
 * @returns An object with `currentUser` (undefined while loading),
 *   `unreadCount`, and `pendingFriendRequestCount`.
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
    pendingFriendRequestCount: notificationsQuery.data?.pendingFriendRequestCount ?? 0,
  };
}

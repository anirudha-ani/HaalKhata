/** Activity data: activity + notification queries; marks notifications read on visit. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { socialClient } from "@/lib/api/connect";
import { queryKeys } from "@/lib/api/queryKeys";

/**
 * Loads the cross-group activity feed and the user's notifications, and marks
 * all notifications as read once on mount (clearing the unread badge).
 *
 * @returns `events` (activity feed entries), `notifications`, `isLoading` for
 *   the activity query, and `refresh`/`isRefreshing` for pull-to-refresh.
 */
export function useActivity() {
  const queryClient = useQueryClient();

  const activity = useQuery({
    queryKey: queryKeys.activity(),
    queryFn: () => socialClient.listActivity({ groupId: "" }),
  });
  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => socialClient.listNotifications({}),
  });

  const markRead = useMutation({
    mutationFn: () => socialClient.markNotificationsRead({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
  const { mutate: markReadNow } = markRead;

  // Visiting the screen clears the unread badge (server no-ops when read).
  useEffect(() => {
    markReadNow();
  }, [markReadNow]);

  return {
    events: activity.data?.events ?? [],
    notifications: notifications.data?.notifications ?? [],
    isLoading: activity.isLoading,
    refresh: () => void activity.refetch(),
    isRefreshing: activity.isRefetching,
  };
}

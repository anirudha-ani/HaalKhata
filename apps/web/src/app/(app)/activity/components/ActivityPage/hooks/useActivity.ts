"use client";
/** Activity data: activity + notification queries; marks notifications read on visit. */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Loads the cross-group activity feed and the user's notifications, and marks
 * all notifications as read once on mount (clearing the unread badge).
 *
 * @returns `events` (activity feed entries), `notifications`, and `isLoading`
 *   for the activity query.
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

  // Visiting the page clears the unread badge (server no-ops when read).
  useEffect(() => {
    markReadNow();
  }, [markReadNow]);

  return {
    events: activity.data?.events ?? [],
    notifications: notifications.data?.notifications ?? [],
    isLoading: activity.isLoading,
  };
}

"use client";
/** Activity data: activity + notification queries; marks notifications read on visit. */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { matchesTerms, searchTerms } from "@/lib/search/filter";
import { ACTIVITY_FILTERS, type ActivityFilter } from "../../../constants/typeEmoji";

/**
 * Loads the cross-group activity feed and the user's notifications, marks all
 * notifications as read once on mount (clearing the unread badge), and holds
 * the feed's search text and type filter.
 *
 * @returns `events` (every feed entry), `visibleEvents` (those matching the
 *   search and type filter), the `query`/`setQuery` and `filter`/`setFilter`
 *   state, `notifications`, and `isLoading` for the activity query.
 */
export function useActivity() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActivityFilter>("all");

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

  const events = activity.data?.events ?? [];
  // The feed message is pre-rendered server-side and already contains the
  // description, amount and group name, so searching it plus the actor covers
  // "that dinner with Ani" without any extra fields.
  const visibleEvents = useMemo(() => {
    const allEvents = activity.data?.events ?? [];
    const kinds = ACTIVITY_FILTERS.find((entry) => entry.value === filter)?.types ?? [];
    const terms = searchTerms(query);
    return allEvents.filter(
      (event) =>
        (kinds.length === 0 || kinds.includes(event.type)) &&
        matchesTerms(terms, event.message, event.actor?.name, event.type),
    );
  }, [activity.data, query, filter]);

  return {
    events,
    visibleEvents,
    query,
    setQuery,
    filter,
    setFilter,
    notifications: notifications.data?.notifications ?? [],
    isLoading: activity.isLoading,
  };
}

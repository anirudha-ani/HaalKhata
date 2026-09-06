/** Activity data: paginated feed + notifications; marks notifications read on visit. */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { socialClient } from "@/lib/api/connect";
import { ACTIVITY_FILTERS, type ActivityFilter } from "@haalkhata/shared/activity/filters";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";

/**
 * Loads the activity feed a page at a time, plus the user's notifications,
 * and marks all notifications read once on mount (clearing the unread badge).
 *
 * Pagination is keyset, driven by the server's `next_cursor`. The month
 * filter is part of the query key, so switching months starts a fresh
 * paginated list rather than appending to the previous month's.
 *
 * Search and the type filter run client-side over the pages already loaded —
 * they narrow what you fetched, they do not re-query — so the row count is
 * always stated against the loaded set rather than implying a total.
 *
 * @returns `events` (everything loaded), `visibleEvents` (after search and
 *   type filter), the `query`/`filter`/`month` state with setters, the
 *   `months` available, `loadMore`/`hasMore`/`isLoadingMore`, `notifications`,
 *   `isLoading`, and `refresh`/`isRefreshing` for pull-to-refresh.
 */
export function useActivity() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [month, setMonth] = useState("");

  const activity = useInfiniteQuery({
    // activityFeed, not activity: the dashboard reads the same feed through a
    // plain useQuery, and an infinite query cannot share its cache entry.
    queryKey: queryKeys.activityFeed(undefined, month),
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      socialClient.listActivity({ groupId: "", cursor: pageParam, month }),
    // An empty cursor means the server has nothing further.
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
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

  const events = useMemo(
    () => (activity.data?.pages ?? []).flatMap((page) => page.events),
    [activity.data],
  );

  // Months come from the newest page: every page carries the same list, and
  // the first one is present as soon as anything has loaded.
  const months = activity.data?.pages[0]?.months ?? [];

  // The feed message is pre-rendered server-side and already contains the
  // description, amount and group name, so searching it plus the actor covers
  // "that dinner with Ani" without any extra fields.
  const visibleEvents = useMemo(() => {
    const kinds = ACTIVITY_FILTERS.find((entry) => entry.value === filter)?.types ?? [];
    const terms = searchTerms(query);
    return events.filter(
      (event) =>
        (kinds.length === 0 || kinds.includes(event.type)) &&
        matchesTerms(terms, event.message, event.actor?.name, event.type),
    );
  }, [events, query, filter]);

  return {
    events,
    visibleEvents,
    months,
    query,
    setQuery,
    filter,
    setFilter,
    month,
    /**
     * Switches the month window. Passing "" returns to the whole history.
     *
     * @param next - A "YYYY-MM" key, or "" for all time.
     */
    setMonth: (next: string) => setMonth(next),
    hasMore: activity.hasNextPage,
    isLoadingMore: activity.isFetchingNextPage,
    loadMore: () => void activity.fetchNextPage(),
    notifications: notifications.data?.notifications ?? [],
    isLoading: activity.isLoading,
    refresh: () => void activity.refetch(),
    isRefreshing: activity.isRefetching && !activity.isFetchingNextPage,
  };
}

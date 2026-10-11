"use client";
/** Usage dashboard state: the chosen trend series, split type, search and ordering, over the overview query. */

import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import {
  ALL_SPLIT_TYPES,
  DEFAULT_PEOPLE_SORT,
  DEFAULT_TREND_METRIC,
  type PeopleSortKey,
  type TrendMetric,
} from "../constants/adminPage";
import { searchPeople, sortPeople } from "../utils/peopleUsage";
import { isSessionEnded, useAdminAnalyticsAPI } from "./useAdminAnalyticsAPI";

/**
 * Holds what the operator has chosen on the usage dashboard and derives the
 * rows the people table shows.
 *
 * Search, the split-type filter and the ordering all run in the browser over
 * the one overview already loaded: they change what is shown, never what is
 * fetched.
 *
 * @param options - Hook options.
 * @param options.onSessionEnded - Called when the server says the admin
 *   session is over, or once the operator signs out.
 * @returns The `overview`, the visible `people`, each control's value and
 *   setter, and the query's loading, refreshing and error state.
 */
export function useUsageDashboard({ onSessionEnded }: { onSessionEnded: () => void }) {
  const { query, signOut } = useAdminAnalyticsAPI({ onSignedOut: onSessionEnded });
  const [trendMetric, setTrendMetric] = useState<TrendMetric>(DEFAULT_TREND_METRIC);
  const [chosenWeek, setChosenWeek] = useState("");
  const [splitType, setSplitType] = useState(ALL_SPLIT_TYPES);
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState(DEFAULT_PEOPLE_SORT);

  const sessionEnded = isSessionEnded(query.error);
  // An ended session is not an error to read; it is a reason to sign in.
  useEffect(() => {
    if (sessionEnded) onSessionEnded();
  }, [sessionEnded, onSessionEnded]);

  const overview = query.data;
  const weeks = overview?.weeks ?? [];
  const allPeople = overview?.users;

  const people = useMemo(
    () =>
      sortPeople(searchPeople(allPeople ?? [], searchText), sort.key, sort.direction, splitType),
    [allPeople, searchText, sort, splitType],
  );

  return {
    overview,
    people,
    trendMetric,
    setTrendMetric,
    // The current week is the one the operator looks for first.
    activeWeek: weeks.some((week) => week.weekStart === chosenWeek)
      ? chosenWeek
      : (weeks[weeks.length - 1]?.weekStart ?? ""),
    setActiveWeek: setChosenWeek,
    splitType,
    setSplitType,
    searchText,
    setSearchText,
    sort,
    /**
     * Orders the table by a column. Choosing the column already in use flips
     * its direction; a new column starts descending for counts (biggest
     * first) and ascending for names.
     *
     * @param sortKey - The column whose header was pressed.
     */
    sortBy: (sortKey: PeopleSortKey) =>
      setSort((previous) =>
        previous.key === sortKey
          ? {
              key: sortKey,
              direction: previous.direction === "ascending" ? "descending" : "ascending",
            }
          : { key: sortKey, direction: sortKey === "name" ? "ascending" : "descending" },
      ),
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
    error: query.error && !sessionEnded ? errorMessage(query.error) : "",
    refresh: () => void query.refetch(),
    signOut: () => signOut.mutate(),
    isSigningOut: signOut.isPending,
    signOutError: signOut.error ? errorMessage(signOut.error) : "",
  };
}

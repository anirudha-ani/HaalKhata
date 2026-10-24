"use client";
/** Usage dashboard state: the chosen split type, search and ordering, over the overview query. */

import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import {
  ALL_SPLIT_TYPES,
  DEFAULT_PEOPLE_SORT,
  type PeopleSortKey,
} from "../constants/adminPage";
import { searchPeople } from "../utils/searchPeople";
import { sortPeople } from "../utils/sortPeople";
import { useAdminAnalyticsAPI } from "./useAdminAnalyticsAPI";
import { useSessionEndWatch } from "./useSessionEndWatch";

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
 *   session is over.
 * @returns The `overview`, the visible `people`, each control's value and
 *   setter, and the query's loading, refreshing and error state.
 */
export function useUsageDashboard({ onSessionEnded }: { onSessionEnded: () => void }) {
  const query = useAdminAnalyticsAPI();
  const [splitType, setSplitType] = useState(ALL_SPLIT_TYPES);
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState(DEFAULT_PEOPLE_SORT);

  const sessionEnded = useSessionEndWatch([query.error], onSessionEnded);

  const overview = query.data;
  const allPeople = overview?.users;

  const people = useMemo(
    () =>
      sortPeople(searchPeople(allPeople ?? [], searchText), sort.key, sort.direction, splitType),
    [allPeople, searchText, sort, splitType],
  );

  return {
    overview,
    people,
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
  };
}

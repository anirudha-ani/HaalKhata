"use client";
/** Usage trend state: the unit, the window on screen, the chosen series and bar. */

import { useState } from "react";
import type { TrendUnit } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { errorMessage } from "@/lib/api/connect";
import { DEFAULT_TREND_METRIC, DEFAULT_TREND_UNIT, type TrendMetric } from "../constants/adminPage";
import { useSessionEndWatch } from "./useSessionEndWatch";
import { useUsageTrendAPI } from "./useUsageTrendAPI";

/**
 * Holds where the operator is in the trend and moves them through it.
 *
 * The window is named by a day the server handed out: Earlier, Later and
 * First send back the end days the last answer named, and Latest sends
 * none (today). Switching between weeks and months keeps the place in
 * time: the new window ends on the last day of the bar that was selected,
 * so the month someone was looking at is still on screen as weeks.
 *
 * The last window that loaded stays on screen when a move fails. The query
 * keeps the previous window only while the next one is pending; once that
 * request fails it holds no data at all, and without the last window there
 * would be no bars and no move to make, Latest included.
 *
 * @param options - Hook options.
 * @param options.onSessionEnded - Called when the server says the admin session is over.
 * @returns The window, the chosen unit, series and bar with their setters,
 *   the moves, and the query's loading, switching and error state.
 */
export function useUsageTrend({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [unit, setUnit] = useState<TrendUnit>(DEFAULT_TREND_UNIT);
  const [endOn, setEndOn] = useState("");
  const [metric, setMetric] = useState<TrendMetric>(DEFAULT_TREND_METRIC);
  const [chosenPeriod, setChosenPeriod] = useState("");
  const query = useUsageTrendAPI(unit, endOn);
  const sessionEnded = useSessionEndWatch([query.error], onSessionEnded);
  const [lastLoaded, setLastLoaded] = useState(query.data);
  if (query.data !== undefined && query.data !== lastLoaded) setLastLoaded(query.data);

  const trend = query.data ?? lastLoaded;
  const periods = trend?.periods ?? [];
  // The newest bar is the one the operator looks for first.
  const activePeriod =
    periods.find((period) => period.startOn === chosenPeriod) ?? periods[periods.length - 1];

  return {
    trend,
    unit,
    /**
     * Switches between weeks and months, keeping the selected bar's time
     * on screen.
     *
     * @param next - The unit picked.
     */
    setUnit: (next: TrendUnit) => {
      setEndOn(activePeriod?.endOn ?? "");
      setChosenPeriod("");
      setUnit(next);
    },
    metric,
    setMetric,
    activePeriod: activePeriod?.startOn ?? "",
    setActivePeriod: setChosenPeriod,
    /**
     * Moves to another window by an end day the server named, or to today
     * when given "".
     *
     * @param nextEndOn - The window's end day.
     */
    goTo: (nextEndOn: string) => {
      setChosenPeriod("");
      setEndOn(nextEndOn);
    },
    /** Where each move goes; "" where there is nowhere to go. */
    moves: {
      firstEndOn: trend?.firstEndOn ?? "",
      earlierEndOn: trend?.earlierEndOn ?? "",
      laterEndOn: trend?.laterEndOn ?? "",
      // Before the first answer there is nowhere to go yet, Latest included.
      isAtLatest: trend === undefined || trend.laterEndOn === "",
    },
    isLoading: query.isLoading,
    /** True while another window loads over the one still shown. */
    isSwitching: query.isPlaceholderData || (query.isFetching && !query.isLoading),
    error: query.error && !sessionEnded ? errorMessage(query.error) : "",
    refresh: () => void query.refetch(),
  };
}

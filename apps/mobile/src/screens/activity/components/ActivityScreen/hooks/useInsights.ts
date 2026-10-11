/** Insights state: the chosen period, currency and month, over the insights query. */

import { useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import {
  DEFAULT_INSIGHT_RANGE,
  type InsightRange,
} from "@haalkhata/shared/analytics/insights";
import { useInsightsAPI } from "./useInsightsAPI";

/**
 * Holds what the person has chosen on the insights dashboard and resolves
 * each choice against the data actually loaded.
 *
 * Lives on the screen rather than inside the panel so pull-to-refresh, which
 * the screen owns, can refresh whichever view is showing. `enabled` keeps
 * the query from running until the person actually opens insights.
 *
 * The chosen currency and month are remembered as the person set them and
 * validated on every render, never corrected in an effect: a choice that no
 * longer exists in the data (a currency with no spending in a shorter
 * window, a month that scrolled out of it) falls back to the default while
 * the original choice stays put, so widening the window again restores it.
 *
 * @param enabled - Whether the insights view is showing.
 * @returns The loaded `insights`, the resolved `currencyBlock` and
 *   `activeMonth`, the `range` and its setter, setters for currency and
 *   month, and the query's loading, refreshing and error state with `refresh`.
 */
export function useInsights(enabled: boolean) {
  const [range, setRange] = useState<InsightRange>(DEFAULT_INSIGHT_RANGE);
  const [chosenCurrency, setChosenCurrency] = useState("");
  const [chosenMonth, setChosenMonth] = useState("");
  const query = useInsightsAPI(range, enabled);

  const insights = query.data;
  const currencies = insights?.currencies ?? [];
  const months = insights?.months ?? [];

  return {
    insights,
    range,
    setRange,
    currencies,
    // The server lists the person's default currency first.
    currencyBlock:
      currencies.find((block) => block.currency === chosenCurrency) ?? currencies[0],
    setCurrency: setChosenCurrency,
    // The newest month is the one a person looks for first.
    activeMonth: months.includes(chosenMonth) ? chosenMonth : (months[months.length - 1] ?? ""),
    setActiveMonth: setChosenMonth,
    isLoading: query.isLoading,
    /** True while a different window is loading over the one still shown. */
    isSwitching: query.isPlaceholderData,
    /** True while a pull-to-refresh of the window already shown is in flight. */
    isRefreshing: query.isRefetching && !query.isPlaceholderData,
    error: query.error ? errorMessage(query.error) : "",
    refresh: () => void query.refetch(),
  };
}

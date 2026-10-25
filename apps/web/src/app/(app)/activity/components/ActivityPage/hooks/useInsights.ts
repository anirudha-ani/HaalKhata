"use client";
/** Insights state: the chosen period, currency and month, over the insights query. */

import { useState } from "react";
import type { GetInsightsResponse } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { errorMessage } from "@/lib/api/connect";
import {
  DEFAULT_INSIGHT_RANGE,
  insightsLoadError,
  pickActiveMonth,
  pickCurrencyBlock,
  type InsightRange,
} from "@haalkhata/shared/analytics/insights";
import { useInsightsAPI } from "./useInsightsAPI";

/**
 * Holds what the person has chosen on the insights dashboard and resolves
 * each choice against the data actually loaded.
 *
 * Lives on the page rather than inside the panel, like the feed's state:
 * the panel is unmounted whenever the other view is showing, and a period
 * or currency chosen a moment ago must still be chosen when it comes back.
 * `enabled` keeps the query from running until insights are on screen.
 *
 * The chosen currency and month are remembered as the person set them and
 * validated on every render, never corrected in an effect: a choice that no
 * longer exists in the data (a currency with no spending in a shorter
 * window, a month that scrolled out of it) falls back to the default while
 * the original choice stays put, so widening the window again restores it.
 *
 * The last window that loaded stays on screen when another fails to load,
 * lifetime card and all: the query keeps the previous window only while
 * the next is pending, and once that request fails it holds nothing. The
 * period control then shows the period those numbers are for, the error
 * names both, and choosing the failed period again asks for it again.
 *
 * @param enabled - Whether the insights view is showing.
 * @returns The `insights` on screen, the resolved `currencyBlock` and
 *   `activeMonth`, the `range` they cover and its setter, setters for
 *   currency and month, and the query's loading and switching state, the
 *   `error` sentence and `retry`.
 */
export function useInsights(enabled: boolean) {
  const [range, setRange] = useState<InsightRange>(DEFAULT_INSIGHT_RANGE);
  const [chosenCurrency, setChosenCurrency] = useState("");
  const [chosenMonth, setChosenMonth] = useState("");
  const query = useInsightsAPI(range, enabled);
  const [lastLoaded, setLastLoaded] = useState<{ range: InsightRange; insights: GetInsightsResponse }>();
  if (query.data !== undefined && !query.isPlaceholderData && query.data !== lastLoaded?.insights) {
    setLastLoaded({ range, insights: query.data });
  }
  // Only a window that failed (or never loaded) holds no data.
  const kept = query.data === undefined ? lastLoaded : undefined;

  const insights = query.data ?? kept?.insights;
  const currencies = insights?.currencies ?? [];

  return {
    insights,
    range: kept?.range ?? range,
    /**
     * Chooses a window size. Choosing the one that just failed asks for it
     * again.
     *
     * @param next - The window size picked.
     */
    setRange: (next: InsightRange) => {
      if (next === range && query.isError) void query.refetch();
      setRange(next);
    },
    currencies,
    currencyBlock: pickCurrencyBlock(currencies, chosenCurrency),
    setCurrency: setChosenCurrency,
    activeMonth: pickActiveMonth(insights?.months ?? [], chosenMonth),
    setActiveMonth: setChosenMonth,
    isLoading: query.isLoading,
    /** True while a different window is loading over the one still shown. */
    isSwitching: query.isPlaceholderData,
    /** The whole sentence for a failed load; "" when nothing failed. */
    error: query.error
      ? insightsLoadError(errorMessage(query.error), kept && { failed: range, shown: kept.range })
      : "",
    retry: () => void query.refetch(),
  };
}

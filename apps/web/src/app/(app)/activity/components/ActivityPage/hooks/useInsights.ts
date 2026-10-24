"use client";
/** Insights state: the chosen period, currency and month, over the insights query. */

import { useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import {
  DEFAULT_INSIGHT_RANGE,
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
 * @param enabled - Whether the insights view is showing.
 * @returns The loaded `insights`, the resolved `currencyBlock` and
 *   `activeMonth`, the `range` and its setter, setters for currency and
 *   month, and the query's loading, switching and error state with `retry`.
 */
export function useInsights(enabled: boolean) {
  const [range, setRange] = useState<InsightRange>(DEFAULT_INSIGHT_RANGE);
  const [chosenCurrency, setChosenCurrency] = useState("");
  const [chosenMonth, setChosenMonth] = useState("");
  const query = useInsightsAPI(range, enabled);

  const insights = query.data;
  const currencies = insights?.currencies ?? [];

  return {
    insights,
    range,
    setRange,
    currencies,
    currencyBlock: pickCurrencyBlock(currencies, chosenCurrency),
    setCurrency: setChosenCurrency,
    activeMonth: pickActiveMonth(insights?.months ?? [], chosenMonth),
    setActiveMonth: setChosenMonth,
    isLoading: query.isLoading,
    /** True while a different window is loading over the one still shown. */
    isSwitching: query.isPlaceholderData,
    error: query.error ? errorMessage(query.error) : "",
    retry: () => void query.refetch(),
  };
}

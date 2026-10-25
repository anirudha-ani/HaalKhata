"use client";
/** Insights panel: the person's own dashboard, drawn from the same history as the feed. */

import { RotateCw } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { INSIGHT_RANGES } from "@haalkhata/shared/analytics/insights";
import type { useInsights } from "../../hooks/useInsights";
import { CategoriesCard } from "./components/CategoriesCard/CategoriesCard";
import { CompanionsCard } from "./components/CompanionsCard/CompanionsCard";
import { JourneyCard } from "./components/JourneyCard/JourneyCard";
import { PlacesCard } from "./components/PlacesCard/PlacesCard";
import { SpendingCard } from "./components/SpendingCard/SpendingCard";
import { SplitTypesCard } from "./components/SplitTypesCard/SplitTypesCard";

/**
 * Renders the insights dashboard: lifetime figures, then one row of filters
 * and everything they scope (spending by month, by category, with whom,
 * where, and how it was split).
 *
 * The filters sit in a single row above the charts they change and nowhere
 * else, so every number below them is always about the same period and the
 * same currency. The lifetime card is above that row because the period
 * does not touch it.
 *
 * The period control is drawn whatever state the data is in. It is the way
 * out of a period that failed to load: hiding it with the charts would
 * leave only "Try again" on the request that just failed, and no way back
 * to the period that was working.
 *
 * Laid out by its own width, not the viewport's: one column as a rail
 * beside the feed or on a phone, two when it has a page to itself.
 *
 * @param props - Component props.
 * @returns The panel.
 */
export function InsightsPanel({
  state,
  showHeading = false,
}: {
  /** The dashboard's data and controls, from the page's `useInsights`. */
  state: ReturnType<typeof useInsights>;
  /** Whether to title the panel; true when it shares the page with the feed. */
  showHeading?: boolean;
}) {
  return (
    <section className="@container space-y-4" aria-label="Your insights">
      {showHeading ? <h2 className="text-xl font-semibold">Insights</h2> : null}

      {state.error ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-3 text-sm font-medium text-neg-700"
        >
          <span className="min-w-0 flex-1">Couldn&apos;t load your insights: {state.error}</span>
          <button
            type="button"
            onClick={state.retry}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neg-600/30 px-3 py-1.5 text-xs font-semibold hover:bg-card"
          >
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : null}

      {state.insights?.journey ? <JourneyCard journey={state.insights.journey} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Period"
          size="sm"
          options={INSIGHT_RANGES}
          value={state.range}
          onChange={state.setRange}
        />
        {state.currencies.length > 1 ? (
          <select
            aria-label="Currency"
            value={state.currencyBlock?.currency ?? ""}
            onChange={(event) => state.setCurrency(event.target.value)}
            className="rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink focus:border-brand-500 focus:outline-none"
          >
            {state.currencies.map((block) => (
              <option key={block.currency} value={block.currency}>
                {block.currency}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {state.isLoading ? (
        <Spinner label="Adding it all up…" />
      ) : state.insights ? (
        // While another period loads, the previous one stays, dimmed: no
        // spinner, no jump in the page's height.
        <div
          className={`grid gap-4 transition-opacity @3xl:grid-cols-2 ${
            state.isSwitching ? "opacity-60" : ""
          }`}
          aria-busy={state.isSwitching}
        >
          <SpendingCard
            months={state.insights.months}
            block={state.currencyBlock}
            activeMonth={state.activeMonth}
            onActivateMonth={state.setActiveMonth}
            className="@3xl:col-span-2"
          />
          <CategoriesCard block={state.currencyBlock} />
          <CompanionsCard companions={state.currencyBlock?.companions ?? []} />
          <PlacesCard groups={state.currencyBlock?.groups ?? []} />
          <SplitTypesCard splitTypes={state.currencyBlock?.splitTypes ?? []} />
        </div>
      ) : null}
    </section>
  );
}

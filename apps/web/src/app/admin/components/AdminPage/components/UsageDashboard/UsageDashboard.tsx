"use client";
/** Usage dashboard: how many people use the product and what they do with it. */

import { RotateCw } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { useUsageDashboard } from "../../hooks/useUsageDashboard";
import { DashboardHeader } from "./components/DashboardHeader/DashboardHeader";
import { PeopleTable } from "./components/PeopleTable/PeopleTable";
import { SplitTypeCard } from "./components/SplitTypeCard/SplitTypeCard";
import { TotalsGrid } from "./components/TotalsGrid/TotalsGrid";
import { TrendCard } from "./components/TrendCard/TrendCard";

/**
 * Renders the operator's overview: headline counts, a twelve-week trend, how
 * expenses were split, and one row of counts per person.
 *
 * Everything on the page comes from one read, taken at the instant shown in
 * the header, so the totals and the table beneath them always describe the
 * same moment. Refreshing keeps the previous figures on screen, dimmed,
 * until the new ones arrive.
 *
 * @param props - Component props.
 * @returns The dashboard.
 */
export function UsageDashboard({
  onSessionEnded,
}: {
  /** Called when the admin session is over, by sign-out or by the server's say-so. */
  onSessionEnded: () => void;
}) {
  const dashboard = useUsageDashboard({ onSessionEnded });
  const overview = dashboard.overview;

  return (
    <div className="space-y-6">
      <DashboardHeader
        generatedAt={overview?.generatedAt ?? ""}
        onRefresh={dashboard.refresh}
        isRefreshing={dashboard.isRefreshing || dashboard.isLoading}
        onSignOut={dashboard.signOut}
        isSigningOut={dashboard.isSigningOut}
      />

      {dashboard.signOutError ? (
        <p
          role="alert"
          className="rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-3 text-sm font-medium text-neg-700"
        >
          Couldn&apos;t sign out: {dashboard.signOutError}. You are still signed in.
        </p>
      ) : null}

      {dashboard.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-3 text-sm font-medium text-neg-700"
        >
          <span className="min-w-0 flex-1">
            Couldn&apos;t load usage: {dashboard.error}
            {overview ? ". The figures below are from the last successful read." : ""}
          </span>
          <button
            type="button"
            onClick={dashboard.refresh}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neg-600/30 px-3 py-1.5 text-xs font-semibold hover:bg-card"
          >
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : null}

      {dashboard.isLoading ? (
        <Spinner label="Counting…" />
      ) : overview ? (
        <div
          className={`space-y-6 transition-opacity ${dashboard.isRefreshing ? "opacity-60" : ""}`}
          aria-busy={dashboard.isRefreshing}
        >
          {overview.totals ? <TotalsGrid totals={overview.totals} /> : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <TrendCard
              weeks={overview.weeks}
              metric={dashboard.trendMetric}
              onMetricChange={dashboard.setTrendMetric}
              activeWeek={dashboard.activeWeek}
              onActivateWeek={dashboard.setActiveWeek}
            />
            <SplitTypeCard splitTypes={overview.expensesBySplitType} />
          </div>

          <PeopleTable
            people={dashboard.people}
            totalPeople={overview.users.length}
            truncated={overview.usersTruncated}
            searchText={dashboard.searchText}
            onSearch={dashboard.setSearchText}
            splitType={dashboard.splitType}
            onSplitTypeChange={dashboard.setSplitType}
            sort={dashboard.sort}
            onSort={dashboard.sortBy}
          />
        </div>
      ) : null}
    </div>
  );
}

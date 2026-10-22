"use client";
/** Usage dashboard: how many people use the product and what they do with it. */

import { Spinner } from "@/components/ui/Spinner/Spinner";
import { useUsageDashboard } from "../../hooks/useUsageDashboard";
import { LoadError } from "../LoadError/LoadError";
import { PanelHeader } from "../PanelHeader/PanelHeader";
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
  /** Called when the server says the admin session is over. */
  onSessionEnded: () => void;
}) {
  const dashboard = useUsageDashboard({ onSessionEnded });
  const overview = dashboard.overview;

  return (
    <div className="space-y-6">
      <PanelHeader
        generatedAt={overview?.generatedAt ?? ""}
        scope="Counts and display names only."
        onRefresh={dashboard.refresh}
        isRefreshing={dashboard.isRefreshing || dashboard.isLoading}
      />

      {dashboard.error ? (
        <LoadError
          what="usage"
          message={dashboard.error}
          staleNote={overview ? "The figures below are from the last successful read." : ""}
          onRetry={dashboard.refresh}
        />
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

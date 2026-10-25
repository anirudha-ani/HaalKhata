"use client";
/** Trend card: one series per week or per month as a column chart, movable through time. */

import { TrendUnit } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { TREND_METRICS, TREND_UNITS } from "../../../../constants/adminPage";
import type { useUsageTrend } from "../../../../hooks/useUsageTrend";
import { periodAxisLabel } from "../../../../utils/periodAxisLabel";
import { periodCount } from "../../../../utils/periodCount";
import { periodName } from "../../../../utils/periodName";
import { windowLabel } from "../../../../utils/windowLabel";
import { LoadError } from "../../../LoadError/LoadError";
import { TrendChart } from "./components/TrendChart/TrendChart";
import { TrendPager } from "./components/TrendPager/TrendPager";

/**
 * Renders twelve weeks or twelve months of one series, anywhere from the
 * first thing that ever happened to today.
 *
 * One series at a time, on one axis. New people and expenses differ by an
 * order of magnitude, and drawing them together would mean either a second
 * axis, whose alignment would invent a relationship between them, or one
 * series flattened into the baseline. The selected bar's count is written
 * out, so no value depends on hovering.
 *
 * @param props - Component props.
 * @returns The card.
 */
export function TrendCard({ state }: { state: ReturnType<typeof useUsageTrend> }) {
  const trend = state.trend;
  const unit = trend?.unit ?? state.unit;
  const periods = trend?.periods ?? [];
  const series = TREND_METRICS.find((entry) => entry.value === state.metric) ?? TREND_METRICS[0];
  /** Spells a count with the series' noun in the right number. */
  const countLabel = (count: number) =>
    `${count.toLocaleString()} ${count === 1 ? series.singular : series.plural}`;
  const unitWord = unit === TrendUnit.MONTH ? "months" : "weeks";

  const columns = periods.map((period) => {
    const count = periodCount(period, state.metric);
    return {
      key: period.startOn,
      axisLabel: periodAxisLabel(period.startOn, unit),
      name: periodName(period.startOn, unit),
      value: count,
      valueLabel: countLabel(count),
    };
  });
  const total = columns.reduce((count, column) => count + column.value, 0);
  const range = windowLabel(periods, unit);

  return (
    <section className="min-w-0 space-y-3 rounded-2xl border border-line bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{range || "Over time"}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {trend ? `${countLabel(total)} in these ${periods.length} ${unitWord}. ` : ""}
            {unit === TrendUnit.MONTH ? "Months in UTC." : "Weeks start on Monday, UTC."}
          </p>
        </div>
        <SegmentedControl
          label="Length of each bar"
          size="sm"
          options={TREND_UNITS}
          value={state.unit}
          onChange={state.setUnit}
        />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TrendPager {...state.moves} isSwitching={state.isSwitching} onGoTo={state.goTo} />
        <SegmentedControl
          label="Series"
          size="sm"
          options={TREND_METRICS}
          value={state.metric}
          onChange={state.setMetric}
        />
      </div>

      {state.error ? (
        <LoadError
          what="this stretch of time"
          message={state.error}
          staleNote={trend ? "The bars below are from the last one that loaded." : ""}
          onRetry={state.refresh}
        />
      ) : null}

      {state.isLoading ? (
        <Spinner label="Counting…" />
      ) : (
        <TrendChart
          columns={columns}
          activeKey={state.activePeriod}
          onActivate={state.setActivePeriod}
          isSwitching={state.isSwitching}
          description={`${series.label} per ${unit === TrendUnit.MONTH ? "month" : "week"}${range ? `, ${range}` : ""}`}
          valueHeading={series.label}
        />
      )}
    </section>
  );
}

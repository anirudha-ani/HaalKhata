"use client";
/** Trend card: one weekly series as a column chart, with a switch between series. */

import type { WeekUsage } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { ColumnChart } from "@/components/charts/ColumnChart/ColumnChart";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { compactNumber, countCeiling } from "@haalkhata/shared/analytics/chart";
import { TREND_METRICS, type TrendMetric } from "../../../../constants/adminPage";
import { weekLabel } from "../../../../utils/peopleUsage";

/**
 * Reads one series' count off a week.
 *
 * @param week - One week of usage.
 * @param metric - Which series to read.
 * @returns That series' count for the week.
 */
function countFor(week: WeekUsage, metric: TrendMetric): number {
  if (metric === "users") return week.newUserCount;
  if (metric === "payments") return week.paymentCount;
  if (metric === "scans") return week.receiptScanCount;
  return week.expenseCount;
}

/**
 * Renders the last twelve weeks of one series.
 *
 * One series at a time, on one axis. New people and expenses differ by an
 * order of magnitude, and drawing them together would mean either a second
 * axis, whose alignment would invent a relationship between them, or one
 * series flattened into the baseline. The switch above the chart picks the
 * series; the selected week's count is written out, so no value depends on
 * hovering a bar.
 *
 * @param props - Component props.
 * @returns The card.
 */
export function TrendCard({
  weeks,
  metric,
  onMetricChange,
  activeWeek,
  onActivateWeek,
}: {
  /** The trailing weeks, oldest first. */
  weeks: readonly WeekUsage[];
  /** The series on show. */
  metric: TrendMetric;
  /** Called with the series the operator picked. */
  onMetricChange: (metric: TrendMetric) => void;
  /** The selected week's Monday, "YYYY-MM-DD". */
  activeWeek: string;
  /** Called with a week's key when its column is hovered, focused or tapped. */
  onActivateWeek: (weekStart: string) => void;
}) {
  const series = TREND_METRICS.find((entry) => entry.value === metric) ?? TREND_METRICS[0];
  /** Spells a count with the series' noun in the right number. */
  const countLabel = (count: number) =>
    `${count.toLocaleString()} ${count === 1 ? series.singular : series.plural}`;

  const columns = weeks.map((week) => {
    const count = countFor(week, metric);
    return {
      key: week.weekStart,
      axisLabel: weekLabel(week.weekStart),
      name: `Week of ${weekLabel(week.weekStart)}`,
      value: count,
      valueLabel: countLabel(count),
    };
  });
  const active = columns.find((column) => column.key === activeWeek);
  const total = columns.reduce((count, column) => count + column.value, 0);

  return (
    <section className="min-w-0 rounded-2xl border border-line bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Last {weeks.length} weeks</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {countLabel(total)} in total. Weeks start on Monday, UTC.
          </p>
        </div>
        <SegmentedControl
          label="Series"
          size="sm"
          options={TREND_METRICS}
          value={metric}
          onChange={onMetricChange}
        />
      </header>

      <p className="mb-3 text-sm" aria-live="polite">
        {active ? (
          <>
            <span className="font-semibold text-ink">{active.name}</span>
            <span className="text-ink-soft"> · </span>
            <span className="text-ink tabular-nums">{active.valueLabel}</span>
          </>
        ) : null}
      </p>

      <ColumnChart
        columns={columns}
        ceiling={countCeiling(columns.reduce((maximum, column) => Math.max(maximum, column.value), 0))}
        formatTick={compactNumber}
        activeKey={activeWeek}
        onActivate={onActivateWeek}
        description={`${series.label} per week over the last ${weeks.length} weeks`}
        valueHeading={series.label}
      />
    </section>
  );
}

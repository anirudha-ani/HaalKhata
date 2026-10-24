"use client";
/** Trend chart: the selected bar written out, above the bars of one window. */

import { ColumnChart, type ChartColumn } from "@/components/charts/ColumnChart/ColumnChart";
import { compactNumber, countCeiling } from "@haalkhata/shared/analytics/chart";

/**
 * Renders one window's bars and, above them, the selected bar's name and
 * count, so no value depends on hovering. Dimmed while the next window
 * loads over it.
 *
 * @param props - Component props.
 * @returns The readout and the chart.
 */
export function TrendChart({
  columns,
  activeKey,
  onActivate,
  isSwitching,
  description,
  valueHeading,
}: {
  /** One column per period, oldest first. */
  columns: readonly ChartColumn[];
  /** The selected period's key. */
  activeKey: string;
  /** Called with a period's key when its column is hovered, focused or tapped. */
  onActivate: (key: string) => void;
  /** Whether another window is loading over this one. */
  isSwitching: boolean;
  /** What the chart shows, for assistive technology. */
  description: string;
  /** The series' name, heading the values column of the chart's table. */
  valueHeading: string;
}) {
  const active = columns.find((column) => column.key === activeKey);
  const tallest = columns.reduce((maximum, column) => Math.max(maximum, column.value), 0);

  return (
    <div className={`space-y-3 transition-opacity ${isSwitching ? "opacity-60" : ""}`} aria-busy={isSwitching}>
      <p className="text-sm" aria-live="polite">
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
        ceiling={countCeiling(tallest)}
        formatTick={compactNumber}
        activeKey={activeKey}
        onActivate={onActivate}
        description={description}
        valueHeading={valueHeading}
      />
    </div>
  );
}

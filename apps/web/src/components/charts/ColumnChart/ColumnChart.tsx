"use client";
/** Column chart: one series of values over an ordered axis, with a selectable column. */

import { barFraction, showsAxisLabel } from "@haalkhata/shared/analytics/chart";
import { MAXIMUM_AXIS_LABELS, MINIMUM_COLUMN_PERCENT } from "./constants/columnChart";

/** One column of the chart. */
export interface ChartColumn {
  /** Stable identity, e.g. a "YYYY-MM" month key. */
  key: string;
  /** Short text under the column, e.g. "Oct". */
  axisLabel: string;
  /** Full name, for the accessible name and the table view, e.g. "October 2026". */
  name: string;
  /** The value plotted. */
  value: number;
  /** The value as a person reads it, e.g. "$412.00". */
  valueLabel: string;
}

/**
 * Renders one series as columns growing from a shared baseline.
 *
 * One colour for every column: the columns are one series, and a second
 * colour would claim a difference that is not in the data. The darker
 * column is the selected one, whose value the caller shows in words; a
 * column is selected by hover, focus or tap, so the chart answers the same
 * way to a mouse, a keyboard and a thumb.
 *
 * No value is reachable only by pointing at a bar. The selected value is
 * shown in text by the caller, and a visually hidden table carries every
 * column for assistive technology.
 *
 * @param props - Component props.
 * @returns The chart as a figure.
 */
export function ColumnChart({
  columns,
  ceiling,
  formatTick,
  activeKey,
  onActivate,
  description,
  valueHeading,
}: {
  /** The columns, oldest (leftmost) first. */
  columns: readonly ChartColumn[];
  /** What the value axis ends on; at or above the largest value. */
  ceiling: number;
  /** Spells an axis value for its gridline label. */
  formatTick: (value: number) => string;
  /** Key of the selected column. */
  activeKey: string;
  /** Called with a column's key when it is hovered, focused or tapped. */
  onActivate: (key: string) => void;
  /** What the chart shows, for assistive technology. */
  description: string;
  /** Column heading for the values in the table view, e.g. "Your share". */
  valueHeading: string;
}) {
  return (
    <figure className="m-0" aria-label={description}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* Value axis: the halfway and top gridlines are labelled; the
            baseline is zero and says so by being the baseline. */}
        <div className="relative h-36 text-right text-[10px] text-ink-soft tabular-nums">
          <span className="invisible block">{formatTick(ceiling)}</span>
          <span className="absolute top-0 right-0 -translate-y-1/2">{formatTick(ceiling)}</span>
          <span className="absolute top-1/2 right-0 -translate-y-1/2">
            {formatTick(ceiling / 2)}
          </span>
        </div>

        <div className="relative h-36 border-b border-line">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-line" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-line" />
          <div className="relative flex h-full items-stretch">
            {columns.map((column) => {
              const active = column.key === activeKey;
              const percent = barFraction(column.value, ceiling) * 100;
              return (
                // The whole slot is the target, not just the painted bar: a
                // short column would otherwise be a few pixels to aim at.
                <button
                  key={column.key}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${column.name}: ${column.valueLabel}`}
                  onClick={() => onActivate(column.key)}
                  onMouseEnter={() => onActivate(column.key)}
                  onFocus={() => onActivate(column.key)}
                  className="group flex min-w-0 flex-1 items-end justify-center px-0.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600"
                >
                  {column.value > 0 ? (
                    <span
                      className={`block w-full max-w-6 rounded-t transition-colors ${
                        active ? "bg-brand-700" : "bg-brand-500 group-hover:bg-brand-600"
                      }`}
                      style={{ height: `${Math.max(percent, MINIMUM_COLUMN_PERCENT)}%` }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div />
        <div className="flex pt-1.5" aria-hidden="true">
          {columns.map((column, index) => (
            <span
              key={column.key}
              className={`min-w-0 flex-1 text-center text-[10px] whitespace-nowrap ${
                column.key === activeKey ? "font-semibold text-ink" : "text-ink-soft"
              }`}
            >
              {showsAxisLabel(index, columns.length, MAXIMUM_AXIS_LABELS) ? column.axisLabel : ""}
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>{description}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{valueHeading}</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={column.key}>
              <th scope="row">{column.name}</th>
              <td>{column.valueLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

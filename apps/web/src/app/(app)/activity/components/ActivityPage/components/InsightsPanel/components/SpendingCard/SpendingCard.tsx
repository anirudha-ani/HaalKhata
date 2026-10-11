"use client";
/** Spending card: the person's share per month as a column chart under its total. */

import type { CurrencyInsights } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { ColumnChart } from "@/components/charts/ColumnChart/ColumnChart";
import { monthLabel } from "@haalkhata/shared/activity/format";
import { compactMoney, moneyCeiling } from "@haalkhata/shared/analytics/chart";
import { averagePerMonth, monthShortLabel } from "@haalkhata/shared/analytics/insights";
import { formatMoney } from "@haalkhata/shared/money/money";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders what the person spent over the window: the total as the one large
 * figure, the months that add up to it as columns, and what they paid up
 * front and settled as plain numbers underneath.
 *
 * "Spent" is their share of each expense, whoever paid at the counter; what
 * they fronted is a different fact and gets its own line. The selected
 * month's amount is written out above the chart, so reading a value never
 * depends on hovering a bar.
 *
 * @param props - Component props.
 * @returns The card.
 */
export function SpendingCard({
  months,
  block,
  activeMonth,
  onActivateMonth,
  className = "",
}: {
  /** The window's "YYYY-MM" keys, oldest first. */
  months: readonly string[];
  /** The window's money in the chosen currency; undefined when there is none. */
  block: CurrencyInsights | undefined;
  /** The selected month's key. */
  activeMonth: string;
  /** Called with a month's key when its column is hovered, focused or tapped. */
  onActivateMonth: (month: string) => void;
  /** Extra classes for the card, e.g. a grid span. */
  className?: string;
}) {
  if (!block) {
    return (
      <InsightCard title="Your spending" className={className}>
        <p className="py-6 text-center text-sm text-ink-soft">
          No expenses in this period. Add one and this fills in.
        </p>
      </InsightCard>
    );
  }

  const currency = block.currency;
  const columns = months.map((month, index) => {
    const cents = block.monthlyShareCents[index] ?? 0;
    return {
      key: month,
      axisLabel: monthShortLabel(month),
      name: monthLabel(month),
      value: cents,
      valueLabel: formatMoney(cents, currency),
    };
  });
  const ceiling = moneyCeiling(
    columns.reduce((maximum, column) => Math.max(maximum, column.value), 0),
    currency,
  );
  const active = columns.find((column) => column.key === activeMonth);

  return (
    <InsightCard
      title="Your spending"
      subtitle="Your share of each expense, whoever paid."
      className={className}
    >
      <p className="text-3xl font-bold text-ink">{formatMoney(block.shareCents, currency)}</p>
      <p className="mt-0.5 text-sm text-ink-soft">
        About {formatMoney(averagePerMonth(block.shareCents, months.length), currency)} a month
      </p>

      {/* The selected month in words: the chart's values are never reachable
          only by pointing at a bar. */}
      <p className="mt-4 mb-3 text-sm" aria-live="polite">
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
        ceiling={ceiling}
        formatTick={(cents) => compactMoney(cents, currency)}
        activeKey={activeMonth}
        onActivate={onActivateMonth}
        description={`Your share of expenses per month, in ${currency}`}
        valueHeading="Your share"
      />

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
        <div className="min-w-0">
          <dt className="truncate text-ink-soft">Paid up front</dt>
          <dd className="mt-0.5 truncate text-sm font-semibold text-ink tabular-nums">
            {formatMoney(block.paidCents, currency)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate text-ink-soft">You paid back</dt>
          <dd className="mt-0.5 truncate text-sm font-semibold text-ink tabular-nums">
            {formatMoney(block.settledOutCents, currency)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate text-ink-soft">Paid back to you</dt>
          <dd className="mt-0.5 truncate text-sm font-semibold text-ink tabular-nums">
            {formatMoney(block.settledInCents, currency)}
          </dd>
        </div>
      </dl>
    </InsightCard>
  );
}

"use client";
/** Split type card: every expense ever added, by how it was split. */

import type { SplitTypeCount } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { BarList } from "@/components/charts/BarList/BarList";
import { percentLabel, splitTypeLabel } from "@haalkhata/shared/analytics/insights";

/**
 * Renders how expenses were split across the whole product, most used first.
 * Every row prints its count and its share, so the card needs no hover and
 * no table twin.
 *
 * @param props - Component props.
 * @returns The card.
 */
export function SplitTypeCard({
  splitTypes,
}: {
  /** Split types in use, most used first. */
  splitTypes: readonly SplitTypeCount[];
}) {
  const total = splitTypes.reduce((count, entry) => count + entry.count, 0);
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-card p-4">
      <header className="mb-3">
        <h2 className="text-base font-semibold">Expenses by type</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Every expense ever added, deleted ones included.
        </p>
      </header>
      {splitTypes.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">No expenses have been added yet.</p>
      ) : (
        <BarList
          rows={splitTypes.map((entry) => ({
            key: entry.splitType,
            label: splitTypeLabel(entry.splitType),
            value: entry.count,
            valueLabel: entry.count.toLocaleString(),
            detail: percentLabel(entry.count, total),
          }))}
        />
      )}
    </section>
  );
}

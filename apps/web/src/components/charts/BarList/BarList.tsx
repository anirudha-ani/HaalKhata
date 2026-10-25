/** Bar list: ranked rows, each a label, a value and a bar sized against the largest. */

import Link from "next/link";
import type { ReactNode } from "react";
import { barFraction } from "@haalkhata/shared/analytics/chart";

/** One row of the list. */
export interface BarListRow {
  /** Stable identity for the row. */
  key: string;
  /** Optional leading element: an avatar, an emoji. */
  leading?: ReactNode;
  /** The row's name. */
  label: string;
  /** The quantity the bar encodes. */
  value: number;
  /** The quantity as a person reads it, e.g. "$120.00" or "4 expenses". */
  valueLabel: string;
  /** Optional secondary figure beside the value, e.g. "38%". */
  detail?: string;
  /** Where the row leads, when it names something with a page of its own. */
  href?: string;
}

/**
 * Renders a ranked list where each row carries its own label and value in
 * text and a thin bar showing how it compares with the largest row.
 *
 * Every bar is the same colour. The rows are names (people, categories,
 * groups), which have no order of their own, and shading them by size would
 * spend colour repeating what the bar's length already says. Because every
 * value is printed, nothing here depends on hover and no table twin is
 * needed: the list is the table.
 *
 * @param props - Component props.
 * @returns The list.
 */
export function BarList({
  rows,
}: {
  /** The rows, largest first. */
  rows: readonly BarListRow[];
}) {
  const largest = rows.reduce((maximum, entry) => Math.max(maximum, entry.value), 0);
  return (
    <ul className="space-y-3">
      {rows.map((entry) => {
        const body = (
          <>
            <span className="flex items-center gap-2.5">
              {entry.leading ? <span className="shrink-0">{entry.leading}</span> : null}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {entry.label}
              </span>
              {entry.detail ? (
                <span className="shrink-0 text-xs text-ink-soft tabular-nums">{entry.detail}</span>
              ) : null}
              <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
                {entry.valueLabel}
              </span>
            </span>
            {/* The track is a lighter step of the bar's own colour, so the
                row reads as "this much of that" rather than a bar on a rule. */}
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-brand-50">
              <span
                className="block h-full rounded-full bg-brand-500"
                style={{ width: `${barFraction(entry.value, largest) * 100}%` }}
              />
            </span>
          </>
        );
        return (
          <li key={entry.key}>
            {entry.href ? (
              <Link href={entry.href} className="block rounded-lg hover:opacity-80">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

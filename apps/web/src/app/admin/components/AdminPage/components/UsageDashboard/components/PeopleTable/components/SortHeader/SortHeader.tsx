"use client";
/** Sort header: a table column heading that orders the table when pressed. */

import { ArrowDown, ArrowUp } from "lucide-react";
import type { PeopleSortKey, SortDirection } from "../../../../../../constants/adminPage";

/**
 * Renders a column heading as a button. The column currently ordering the
 * table shows which way, and says so to assistive technology through
 * `aria-sort` on its cell.
 *
 * @param props - Component props.
 * @returns The heading cell.
 */
export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
  className = "",
}: {
  /** The column's caption. */
  label: string;
  /** The column this heading orders by. */
  sortKey: PeopleSortKey;
  /** The table's current ordering. */
  sort: { key: PeopleSortKey; direction: SortDirection };
  /** Called with this column's key when the heading is pressed. */
  onSort: (sortKey: PeopleSortKey) => void;
  /** Which edge the caption sits against; numbers align right. */
  align?: "left" | "right";
  /** Extra classes for the cell, e.g. to hide it on a narrow screen. */
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.direction === "ascending" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? sort.direction : "none"}
      className={`px-1 py-2 font-medium first:pl-4 last:pr-4 sm:px-2 ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 rounded hover:text-ink ${
          active ? "text-ink" : "text-ink-soft"
        }`}
      >
        {label}
        {active ? <Arrow className="h-3 w-3" aria-hidden="true" /> : null}
      </button>
    </th>
  );
}

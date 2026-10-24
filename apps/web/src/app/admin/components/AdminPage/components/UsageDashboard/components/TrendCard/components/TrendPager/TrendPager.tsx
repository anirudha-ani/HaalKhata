"use client";
/** Trend pager: First, Earlier, Later and Latest, to move the trend through time. */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

/**
 * Renders the four moves through time. Each goes to a window the server
 * named, so a move that has nowhere to go (nothing happened earlier, the
 * window already holds today) is disabled rather than offered.
 *
 * @param props - Component props.
 * @returns The pager.
 */
export function TrendPager({
  firstEndOn,
  earlierEndOn,
  laterEndOn,
  isAtLatest,
  isSwitching,
  onGoTo,
}: {
  /** End day of the first window with anything in it; "" when this is it. */
  firstEndOn: string;
  /** End day of the window before this one; "" when nothing happened earlier. */
  earlierEndOn: string;
  /** End day of the window after this one; "" when this one holds today. */
  laterEndOn: string;
  /** Whether the window on screen already holds today. */
  isAtLatest: boolean;
  /** Whether another window is loading. */
  isSwitching: boolean;
  /** Moves to the window ending on a day; "" means today. */
  onGoTo: (endOn: string) => void;
}) {
  const moves = [
    { label: "First", Icon: ChevronsLeft, target: firstEndOn, enabled: firstEndOn !== "" },
    { label: "Earlier", Icon: ChevronLeft, target: earlierEndOn, enabled: earlierEndOn !== "" },
    { label: "Later", Icon: ChevronRight, target: laterEndOn, enabled: laterEndOn !== "" },
    { label: "Latest", Icon: ChevronsRight, target: "", enabled: !isAtLatest },
  ];

  return (
    <div role="group" aria-label="Move through time" className="flex flex-wrap gap-1.5">
      {moves.map(({ label, Icon, target, enabled }) => (
        <button
          key={label}
          type="button"
          onClick={() => onGoTo(target)}
          disabled={!enabled || isSwitching}
          className="flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft"
        >
          {label === "Later" || label === "Latest" ? null : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
          {label}
          {label === "Later" || label === "Latest" ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

"use client";
/** Load error: why an admin view could not load, with a way to try again. */

import { RotateCw } from "lucide-react";

/**
 * Renders a failed load at the top of an admin view. When the view still
 * holds an earlier read, it says so, so stale figures or a stale queue are
 * never passed off as current.
 *
 * @param props - Component props.
 * @returns The alert.
 */
export function LoadError({
  what,
  message,
  staleNote,
  onRetry,
}: {
  /** What failed to load, e.g. "usage". */
  what: string;
  /** The server's or the network's reason. */
  message: string;
  /** What is still on screen from the last good read; empty when nothing is. */
  staleNote: string;
  /** Loads again. */
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-3 text-sm font-medium text-neg-700"
    >
      <span className="min-w-0 flex-1">
        Couldn&apos;t load {what}: {message}
        {staleNote ? `. ${staleNote}` : ""}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neg-600/30 px-3 py-1.5 text-xs font-semibold hover:bg-card"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
      </button>
    </div>
  );
}

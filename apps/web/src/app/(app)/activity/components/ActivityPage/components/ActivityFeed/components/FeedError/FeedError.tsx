"use client";
/** Feed error: why the feed, or its next page, did not load, with a way to try again. */

import { RotateCw } from "lucide-react";

/**
 * Says the feed failed to load and why, in place of the rows it could not
 * show, so a failure never reads as an empty history.
 *
 * @param props - Component props.
 * @returns The alert.
 */
export function FeedError({
  message,
  onRetry,
}: {
  /** The whole sentence: what failed and why. */
  message: string;
  /** Asks again; omitted when the control that failed sits right below and is the retry. */
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-3 text-sm font-medium text-neg-700"
    >
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neg-600/30 px-3 py-1.5 text-xs font-semibold hover:bg-card"
        >
          <RotateCw className="h-3.5 w-3.5" /> Try again
        </button>
      ) : null}
    </div>
  );
}

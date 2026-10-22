"use client";
/** Panel header: when a view's figures were read, what the view shows, and its refresh control. */

import { RotateCw } from "lucide-react";
import { localDateTime } from "@haalkhata/shared/time/localTime";

/**
 * Renders the line above each admin view. The "as of" time is the instant
 * the server read what the view shows, so a tab left open says how old its
 * contents are instead of passing them off as current.
 *
 * @param props - Component props.
 * @returns The header.
 */
export function PanelHeader({
  generatedAt,
  scope,
  onRefresh,
  isRefreshing,
}: {
  /** RFC 3339 instant the view's data was read; empty before the first load. */
  generatedAt: string;
  /** One sentence on what this view shows, and what it never shows. */
  scope: string;
  /** Reloads the view. */
  onRefresh: () => void;
  /** Whether a load is in flight. */
  isRefreshing: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 text-sm text-ink-soft">
        {generatedAt ? `As of ${localDateTime(generatedAt)}. ` : ""}
        {scope}
      </p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
      >
        <RotateCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
        Refresh
      </button>
    </div>
  );
}

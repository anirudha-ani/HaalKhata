"use client";
/** Dashboard header: the page title, when the figures were read, and the refresh and sign-out controls. */

import { LogOut, RotateCw } from "lucide-react";
import { localDateTime } from "@haalkhata/shared/time/localTime";

/**
 * Renders the top of the usage dashboard. The "as of" time is the instant
 * the server read every figure on the page, so a tab left open says how old
 * its numbers are instead of passing them off as current.
 *
 * @param props - Component props.
 * @returns The header.
 */
export function DashboardHeader({
  generatedAt,
  onRefresh,
  isRefreshing,
  onSignOut,
  isSigningOut,
}: {
  /** RFC 3339 instant the figures were read; empty before the first load. */
  generatedAt: string;
  /** Reloads the overview. */
  onRefresh: () => void;
  /** Whether a load is in flight. */
  isRefreshing: boolean;
  /** Ends the admin session. */
  onSignOut: () => void;
  /** Whether sign-out is in flight. */
  isSigningOut: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold">HaalKhata usage</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {generatedAt ? `As of ${localDateTime(generatedAt)}. ` : ""}
          Counts and display names only.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
        >
          <RotateCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <button
          type="button"
          onClick={onSignOut}
          disabled={isSigningOut}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </header>
  );
}

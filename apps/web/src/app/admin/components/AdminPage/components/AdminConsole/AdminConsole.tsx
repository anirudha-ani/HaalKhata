"use client";
/** Admin console: the signed-in admin page, with its two views and sign-out. */

import { LogOut } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { useAdminConsole } from "../../hooks/useAdminConsole";
import { ReportQueue } from "../ReportQueue/ReportQueue";
import { UsageDashboard } from "../UsageDashboard/UsageDashboard";

/**
 * Renders the signed-in admin page: the title and sign-out, a switch
 * between the usage overview and the report queue, and the view chosen.
 * The switch carries how many reports are waiting, so new ones are seen
 * from the usage view too.
 *
 * @param props - Component props.
 * @returns The console.
 */
export function AdminConsole({
  onSessionEnded,
}: {
  /** Called when the admin session is over, by sign-out or by the server's say-so. */
  onSessionEnded: () => void;
}) {
  const adminConsole = useAdminConsole({ onSessionEnded });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">HaalKhata admin</h1>
        <button
          type="button"
          onClick={adminConsole.signOut}
          disabled={adminConsole.isSigningOut}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </header>

      {adminConsole.signOutError ? (
        <p
          role="alert"
          className="rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-3 text-sm font-medium text-neg-700"
        >
          Couldn&apos;t sign out: {adminConsole.signOutError}. You are still signed in.
        </p>
      ) : null}

      <SegmentedControl
        label="Admin view"
        options={adminConsole.views}
        value={adminConsole.view}
        onChange={adminConsole.setView}
      />

      {adminConsole.view === "usage" ? (
        <UsageDashboard onSessionEnded={onSessionEnded} />
      ) : (
        <ReportQueue moderation={adminConsole.moderation} />
      )}
    </div>
  );
}

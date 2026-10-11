"use client";
/** Activity page: the feed of what happened, and the person's own insights drawn from it. */

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import {
  ACTIVITY_VIEWS,
  DEFAULT_ACTIVITY_VIEW,
  type ActivityView,
} from "@haalkhata/shared/analytics/insights";
import { ActivityFeed } from "./components/ActivityFeed/ActivityFeed";
import { InsightsPanel } from "./components/InsightsPanel/InsightsPanel";
import { SIDE_BY_SIDE_QUERY } from "./constants/activityPage";
import { useActivity } from "./hooks/useActivity";

/**
 * Renders Activity as two views of the same history: the feed (what
 * happened, newest first) and insights (what it adds up to).
 *
 * On a wide screen both are on the page at once, the feed beside a rail of
 * charts. Anywhere narrower there is room for one, so a switch chooses, and
 * it opens on the feed: this page is where the notification bell leads, and
 * someone following a badge wants the news before the totals.
 *
 * A view that is not showing is not mounted, so a phone never fetches
 * insights nobody asked to see.
 *
 * @returns The activity page content.
 */
export function ActivityPage() {
  const activity = useActivity();
  const hydrated = useHydrated();
  const sideBySide = useMediaQuery(SIDE_BY_SIDE_QUERY);
  const [view, setView] = useState<ActivityView>(DEFAULT_ACTIVITY_VIEW);
  if (!hydrated || activity.isLoading) return <Spinner label="Loading activity…" />;

  return (
    <div className={`mx-auto space-y-5 ${sideBySide ? "" : "max-w-3xl"}`}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">Activity</h1>
        {sideBySide ? null : (
          <SegmentedControl
            label="Activity view"
            options={ACTIVITY_VIEWS}
            value={view}
            onChange={setView}
          />
        )}
      </header>

      {sideBySide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-8">
          <ActivityFeed activity={activity} />
          <InsightsPanel showHeading />
        </div>
      ) : view === "feed" ? (
        <ActivityFeed activity={activity} />
      ) : (
        <InsightsPanel />
      )}
    </div>
  );
}

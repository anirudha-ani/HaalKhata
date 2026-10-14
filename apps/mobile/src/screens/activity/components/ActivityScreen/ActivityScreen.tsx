/** Activity screen: the feed of what happened, and the person's own insights drawn from it. */

import { useState } from "react";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Segmented } from "@/components/ui/Segmented";
import { Spinner } from "@/components/ui/Spinner";
import {
  ACTIVITY_VIEWS,
  DEFAULT_ACTIVITY_VIEW,
  type ActivityView,
} from "@haalkhata/shared/analytics/insights";
import { ActivityFeed } from "./components/ActivityFeed/ActivityFeed";
import { InsightsPanel } from "./components/InsightsPanel/InsightsPanel";
import { useActivity } from "./hooks/useActivity";
import { useInsights } from "./hooks/useInsights";

/**
 * Renders Activity as two views of the same history: the feed (what
 * happened, newest first) and insights (what it adds up to). Visiting the
 * screen marks notifications read.
 *
 * A switch chooses between them and opens on the feed: this screen is where
 * the notification bell leads, and someone following a badge wants the news
 * before the totals. Insights are not fetched until that view is opened, and
 * pulling to refresh reloads whichever view is showing.
 *
 * @returns The activity screen content.
 */
export function ActivityScreen() {
  const [view, setView] = useState<ActivityView>(DEFAULT_ACTIVITY_VIEW);
  const activity = useActivity();
  const insights = useInsights(view === "insights");
  const showingFeed = view === "feed";

  return (
    <Screen
      header={<DetailHeader title="Activity" />}
      onRefresh={showingFeed ? activity.refresh : insights.refresh}
      refreshing={showingFeed ? activity.isRefreshing : insights.isRefreshing}
    >
      <Segmented onChange={setView} options={ACTIVITY_VIEWS} value={view} />
      {showingFeed ? (
        activity.isLoading ? (
          <Spinner label="Loading activity…" />
        ) : (
          <ActivityFeed activity={activity} />
        )
      ) : (
        <InsightsPanel state={insights} />
      )}
    </Screen>
  );
}

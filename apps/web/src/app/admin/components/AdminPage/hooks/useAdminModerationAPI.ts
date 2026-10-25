"use client";
/** Admin moderation API: the report queue query and the one mutation every action goes through. */

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReportQueue } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { adminModerationClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { QUEUE_REFRESH_PAUSE_MS, type ModerationAction } from "../constants/moderation";
import { isSessionEnded } from "../utils/isSessionEnded";
import { withoutReport } from "../utils/withoutReport";

/**
 * Loads the report queue and runs the operator's actions on it.
 *
 * Every action is one mutation, named by its variables, so the page knows
 * which report a pending action or a failure belongs to. Afterwards
 * everything the admin page shows is out of date (a removal can change the
 * usage figures too) and is marked so, but read again at a pace the read
 * budget allows:
 * - a dismissal or removal takes its entry off the screen at once, and the
 *   queue is read again once the operator pauses (QUEUE_REFRESH_PAUSE_MS),
 *   so clearing a run of spam is one read, not one per click;
 * - a suspension or resumption changes the author on every card about them
 *   and the suspended list, so it is read again at once;
 * - a refusal ("already handled") means the queue on screen is wrong, so
 *   it is read again at once as well.
 * Coming back to the tab is not a reason to read: the Refresh button is.
 *
 * @returns The queue `query` and the `perform` mutation.
 */
export function useAdminModerationAPI() {
  const queryClient = useQueryClient();
  const pausedRefresh = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(pausedRefresh.current), []);

  /** Reads everything the admin page shows again, now, and drops any read waiting for a pause. */
  const refreshNow = () => {
    clearTimeout(pausedRefresh.current);
    return queryClient.invalidateQueries({ queryKey: queryKeys.admin });
  };

  const query = useQuery({
    queryKey: queryKeys.adminReports,
    queryFn: () => adminModerationClient.listReports({}),
    retry: (failureCount, error) => !isSessionEnded(error) && failureCount < 1,
    refetchOnWindowFocus: false,
  });

  const perform = useMutation({
    mutationFn: ({ action, reportId }: { action: ModerationAction; reportId: string }) => {
      switch (action) {
        case "dismiss":
          return adminModerationClient.dismissReport({ reportId });
        case "remove":
          return adminModerationClient.removeReportedContent({ reportId });
        case "suspend":
          return adminModerationClient.suspendAuthor({ reportId });
        case "resume":
          return adminModerationClient.resumeAuthor({ reportId });
      }
    },
    onSuccess: (_answer, { action, reportId }) => {
      if (action !== "dismiss" && action !== "remove") return refreshNow();
      queryClient.setQueryData<ReportQueue>(queryKeys.adminReports, (queue) =>
        withoutReport(queue, reportId),
      );
      clearTimeout(pausedRefresh.current);
      pausedRefresh.current = setTimeout(() => void refreshNow(), QUEUE_REFRESH_PAUSE_MS);
      return queryClient.invalidateQueries({ queryKey: queryKeys.admin, refetchType: "none" });
    },
    onError: () => refreshNow(),
  });

  return { query, perform };
}

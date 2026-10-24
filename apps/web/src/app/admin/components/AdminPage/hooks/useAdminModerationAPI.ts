"use client";
/** Admin moderation API: the report queue query and the one mutation every action goes through. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminModerationClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { ModerationAction } from "../constants/moderation";
import { isSessionEnded } from "../utils/isSessionEnded";

/**
 * Loads the report queue and runs the operator's actions on it.
 *
 * Every action is one mutation, named by its variables, so the page knows
 * which report a pending action or a failure belongs to. Whatever the
 * outcome, everything the admin page shows is reloaded afterwards: a
 * removal can change the usage figures too, and a refusal ("already
 * handled") means the queue on screen is out of date.
 *
 * @returns The queue `query` and the `perform` mutation.
 */
export function useAdminModerationAPI() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.adminReports,
    queryFn: () => adminModerationClient.listReports({}),
    retry: (failureCount, error) => !isSessionEnded(error) && failureCount < 1,
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin }),
  });

  return { query, perform };
}

"use client";
/** Report queue state: which action is being confirmed, which is running, and what failed where. */

import { useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import { ACTION_VERBS, type ModerationAction } from "../constants/moderation";
import { isSessionEnded } from "../utils/isSessionEnded";
import { questionAfterSuccess } from "../utils/questionAfterSuccess";
import type { useAdminModerationAPI } from "./useAdminModerationAPI";

/** An action on one report: the thing being confirmed, run, or reported as failed. */
export interface ReportAction {
  reportId: string;
  action: ModerationAction;
}

/**
 * Holds the queue's interaction state over the moderation API the page
 * already loaded.
 *
 * Removing and suspending are asked about first; the question replaces the
 * card's buttons and stays open, with the failure beside it, until the
 * action succeeds or the operator cancels. Dismissing and resuming run at
 * once. A failure is reported on the card or row it came from; when that
 * card has left the queue in the meantime (another tab handled it), the
 * failure is reported above the list instead, so it is never shown nowhere.
 *
 * @param moderation - The queue query and action mutation.
 * @returns The queue, its load state, the action state and the handlers.
 */
export function useReportQueue(moderation: ReturnType<typeof useAdminModerationAPI>) {
  const { query, perform } = moderation;
  const [confirming, setConfirming] = useState<ReportAction | null>(null);

  const queue = query.data;
  const failed =
    perform.error && perform.variables && !isSessionEnded(perform.error)
      ? {
          ...perform.variables,
          message: `Couldn't ${ACTION_VERBS[perform.variables.action]}: ${errorMessage(perform.error)}`,
        }
      : null;
  const failureHasAPlace =
    failed !== null &&
    (queue?.reports.some((entry) => entry.reportId === failed.reportId) ||
      queue?.suspended.some((account) => account.reportId === failed.reportId));

  const running = perform.isPending ? (perform.variables ?? null) : null;

  return {
    queue,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
    error: query.error && !isSessionEnded(query.error) ? errorMessage(query.error) : "",
    refresh: () => void query.refetch(),
    confirming,
    /** The action running now, if any; every action control waits for it. */
    running,
    /** The report a resume from the suspended list is running through; "" when none is. */
    resumingReportId: running?.action === "resume" ? running.reportId : "",
    /** The latest failure when it was a resume, for the suspended list. */
    resumeFailure: failed?.action === "resume" ? failed : null,
    /** The latest failure, to show beside the control that caused it. */
    failed,
    /** The latest failure when its card or row is gone, to show above the list. */
    unplacedFailure: failed && !failureHasAPlace ? failed : null,
    /**
     * Opens the question for an action that needs one.
     *
     * @param reportId - The report the action goes through.
     * @param action - What the operator asked to do.
     */
    ask: (reportId: string, action: ModerationAction) => {
      perform.reset();
      setConfirming({ reportId, action });
    },
    /** Closes the question without doing anything. */
    cancel: () => {
      perform.reset();
      setConfirming(null);
    },
    /**
     * Runs an action; the question that led to it closes once it succeeds,
     * and a question open on another card stays open.
     *
     * @param reportId - The report the action goes through.
     * @param action - What to do.
     */
    run: (reportId: string, action: ModerationAction) =>
      perform.mutate(
        { reportId, action },
        { onSuccess: () => setConfirming((open) => questionAfterSuccess(open, { reportId, action })) },
      ),
  };
}

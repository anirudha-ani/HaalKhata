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
 * One action runs at a time. Every action shares one mutation, and a second
 * call while one is pending would take its place: the first one's failure
 * would then never be shown, and the controls would come back while it was
 * still running on the server. So a run waits for the one in flight, and
 * opening or closing a question clears an old failure only when nothing is
 * running and the failure is that question's own: on its card when one
 * opens, from that very action when one closes.
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
     * Opens the question for an action that needs one. A failure on the
     * same card is cleared, because the question takes the place of the
     * buttons it was shown beside; a failure on another card stays there.
     *
     * @param reportId - The report the action goes through.
     * @param action - What the operator asked to do.
     */
    ask: (reportId: string, action: ModerationAction) => {
      if (perform.isPending) return;
      if (perform.variables?.reportId === reportId) perform.reset();
      setConfirming({ reportId, action });
    },
    /** Closes the question without doing anything, and with it its own failure. */
    cancel: () => {
      const ownFailure =
        perform.variables?.reportId === confirming?.reportId &&
        perform.variables?.action === confirming?.action;
      if (!perform.isPending && ownFailure) perform.reset();
      setConfirming(null);
    },
    /**
     * Runs an action unless another is running; the question that led to
     * it closes once it succeeds, and a question open on another card stays
     * open.
     *
     * @param reportId - The report the action goes through.
     * @param action - What to do.
     */
    run: (reportId: string, action: ModerationAction) => {
      if (perform.isPending) return;
      perform.mutate(
        { reportId, action },
        { onSuccess: () => setConfirming((open) => questionAfterSuccess(open, { reportId, action })) },
      );
    },
  };
}

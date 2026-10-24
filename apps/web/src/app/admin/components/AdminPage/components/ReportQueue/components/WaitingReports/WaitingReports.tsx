"use client";
/** Waiting reports: the reported items still waiting for a decision, longest waiting first. */

import type { ReportedContent } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { EMPTY_QUEUE_NOTE, type ModerationAction } from "../../../../constants/moderation";
import type { ReportAction } from "../../../../hooks/useReportQueue";
import { ReportCard } from "../ReportCard/ReportCard";

/**
 * Renders the queue's list: one card per reported item, or a note saying
 * nothing is waiting, and a note when the list was cut short. Hands each
 * card only the state that belongs to it.
 *
 * @param props - Component props.
 * @returns The section.
 */
export function WaitingReports({
  reports,
  truncated,
  confirming,
  running,
  failed,
  onAsk,
  onRun,
  onCancel,
}: {
  /** The reported items, longest waiting first. */
  reports: readonly ReportedContent[];
  /** Whether more are waiting than the list holds. */
  truncated: boolean;
  /** The action whose question is open, if any. */
  confirming: ReportAction | null;
  /** The action running now, if any. */
  running: ReportAction | null;
  /** The latest failure, if any. */
  failed: (ReportAction & { message: string }) | null;
  /** Opens the question for an action on a report. */
  onAsk: (reportId: string, action: ModerationAction) => void;
  /** Runs an action on a report. */
  onRun: (reportId: string, action: ModerationAction) => void;
  /** Closes the open question. */
  onCancel: () => void;
}) {
  /** @returns The action of `state` when it is about `reportId`, else null. */
  const actionOn = (state: ReportAction | null, reportId: string) =>
    state?.reportId === reportId ? state.action : null;

  return (
    <section aria-labelledby="waiting-reports" className="space-y-3">
      <h2 id="waiting-reports" className="text-lg font-bold">
        Waiting for a decision
      </h2>
      {reports.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-6 text-sm text-ink-soft">
          {EMPTY_QUEUE_NOTE}
        </p>
      ) : (
        <ol className="space-y-3">
          {reports.map((entry) => (
            <li key={entry.reportId}>
              <ReportCard
                entry={entry}
                confirming={actionOn(confirming, entry.reportId)}
                running={actionOn(running, entry.reportId)}
                anyRunning={running !== null}
                error={failed?.reportId === entry.reportId ? failed.message : ""}
                onAsk={(action) => onAsk(entry.reportId, action)}
                onRun={(action) => onRun(entry.reportId, action)}
                onCancel={onCancel}
              />
            </li>
          ))}
        </ol>
      )}
      {truncated ? (
        <p className="text-sm text-ink-soft">
          Showing the {reports.length.toLocaleString()} that have waited longest. The rest appear as
          these are handled.
        </p>
      ) : null}
    </section>
  );
}

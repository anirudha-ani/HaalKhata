"use client";
/** Report queue: what people reported, oldest first, and the accounts suspended because of it. */

import { Spinner } from "@/components/ui/Spinner/Spinner";
import type { useAdminModerationAPI } from "../../hooks/useAdminModerationAPI";
import { useReportQueue } from "../../hooks/useReportQueue";
import { LoadError } from "../LoadError/LoadError";
import { PanelHeader } from "../PanelHeader/PanelHeader";
import { SuspendedAccounts } from "./components/SuspendedAccounts/SuspendedAccounts";
import { WaitingReports } from "./components/WaitingReports/WaitingReports";

/**
 * Renders the moderation queue: one card per piece of reported content,
 * longest waiting first, then the accounts suspended right now.
 *
 * This view shows people's own words, because judging them is the job, and
 * the display name of whoever wrote them. It never shows who made a report:
 * the server does not send it.
 *
 * @param props - Component props.
 * @returns The queue.
 */
export function ReportQueue({
  moderation,
}: {
  /** The queue query and action mutation, loaded by the page above. */
  moderation: ReturnType<typeof useAdminModerationAPI>;
}) {
  const queue = useReportQueue(moderation);
  const data = queue.queue;

  return (
    <div className="space-y-6">
      <PanelHeader
        generatedAt={data?.generatedAt ?? ""}
        scope="What people reported and who wrote it. Never who reported it."
        onRefresh={queue.refresh}
        isRefreshing={queue.isRefreshing || queue.isLoading}
      />

      {queue.error ? (
        <LoadError
          what="reports"
          message={queue.error}
          staleNote={data ? "The queue below is from the last successful read." : ""}
          onRetry={queue.refresh}
        />
      ) : null}

      {queue.unplacedFailure ? (
        <p
          role="alert"
          className="rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-3 text-sm font-medium text-neg-700"
        >
          {queue.unplacedFailure.message}
        </p>
      ) : null}

      {queue.isLoading ? (
        <Spinner label="Loading reports…" />
      ) : data ? (
        <div
          className={`space-y-8 transition-opacity ${queue.isRefreshing ? "opacity-60" : ""}`}
          aria-busy={queue.isRefreshing}
        >
          <WaitingReports
            reports={data.reports}
            truncated={data.reportsTruncated}
            confirming={queue.confirming}
            running={queue.running}
            failed={queue.failed}
            onAsk={queue.ask}
            onRun={queue.run}
            onCancel={queue.cancel}
          />

          <SuspendedAccounts
            accounts={data.suspended}
            runningReportId={queue.resumingReportId}
            anyRunning={queue.running !== null}
            failure={queue.resumeFailure}
            onResume={(reportId) => queue.run(reportId, "resume")}
          />
        </div>
      ) : null}
    </div>
  );
}

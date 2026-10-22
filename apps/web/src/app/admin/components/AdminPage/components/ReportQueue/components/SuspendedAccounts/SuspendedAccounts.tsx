"use client";
/** Suspended accounts: who is suspended right now, since when, and the way to lift it. */

import type { SuspendedAccount } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { localDateTime } from "@haalkhata/shared/time/localTime";
import { WITHHELD_NAME_LABEL } from "../../../../constants/adminPage";
import { NO_REPORT_TO_RESUME_NOTE } from "../../../../constants/moderation";

/**
 * Lists the accounts suspended right now. Each is resumed through the
 * newest report about them, the same handle the queue uses, so this list
 * still works for someone whose reports were all settled long ago. Someone
 * with no report left says so, and where to go instead.
 *
 * @param props - Component props.
 * @returns The section.
 */
export function SuspendedAccounts({
  accounts,
  runningReportId,
  anyRunning,
  failure,
  onResume,
}: {
  /** The suspended accounts, most recent first. */
  accounts: readonly SuspendedAccount[];
  /** The report a resume is running through, if any. */
  runningReportId: string;
  /** Whether any action is running anywhere on the page. */
  anyRunning: boolean;
  /** The latest failed resume, to show on its row. */
  failure: { reportId: string; message: string } | null;
  /** Resumes the account a report is about. */
  onResume: (reportId: string) => void;
}) {
  return (
    <section aria-labelledby="suspended-accounts" className="space-y-3">
      <h2 id="suspended-accounts" className="text-lg font-bold">
        Suspended accounts
      </h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-ink-soft">Nobody is suspended.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {accounts.map((account) => (
            // Without a report, the instant of suspension tells two rows apart.
            <li key={account.reportId || `${account.name}|${account.suspendedAt}`} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{account.name || WITHHELD_NAME_LABEL}</p>
                  <p className="text-xs text-ink-soft">Suspended {localDateTime(account.suspendedAt)}</p>
                </div>
                {account.reportId ? (
                  <button
                    type="button"
                    onClick={() => onResume(account.reportId)}
                    disabled={anyRunning}
                    className="shrink-0 rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
                  >
                    {runningReportId === account.reportId ? "Resuming…" : "Resume"}
                  </button>
                ) : (
                  <p className="max-w-xs text-xs text-ink-soft">{NO_REPORT_TO_RESUME_NOTE}</p>
                )}
              </div>
              {failure && account.reportId && failure.reportId === account.reportId ? (
                <p role="alert" className="mt-2 text-sm font-medium text-neg-700">
                  {failure.message}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

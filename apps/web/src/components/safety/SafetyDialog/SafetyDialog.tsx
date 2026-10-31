"use client";
/** Report or block dialog: asks, sends only what was confirmed, and says so in place once it is done. */

import { useState } from "react";
import {
  REPORT_REASONS,
  SAFETY_DIALOG_COPY,
  type ReportTargetKind,
  type SafetyDialogMode,
} from "@haalkhata/shared/safety/safety";
import { Modal } from "@/components/ui/Modal/Modal";
import { errorMessage } from "@/lib/api/connect";
import { useSafetyAPI } from "@/lib/hooks/useSafetyAPI";

/**
 * Renders the report or block dialog for one target. A failure stays in the
 * open dialog and can be retried; success replaces the question with its
 * confirmation, so whoever opened it — a link beside the content or a
 * header menu — never has to find a notice somewhere else on the page. The
 * reporter is never revealed to the person reported.
 *
 * Mount it only while it is open: each mount starts from a clean mutation,
 * so an error from an earlier attempt is never shown against a new one.
 *
 * @param props - Component props.
 * @returns The dialog.
 */
export function SafetyDialog({
  mode,
  targetKind,
  targetId,
  userId,
  onClose,
}: {
  /** Whether this dialog reports the target or blocks `userId`. */
  mode: SafetyDialogMode;
  /** Kind of the visible thing being reported. */
  targetKind: ReportTargetKind;
  /** Identifier of the visible thing being reported. */
  targetId: string;
  /** The person to block; required when `mode` is "block". */
  userId?: string;
  /** Called when the dialog is dismissed or finished. */
  onClose: () => void;
}) {
  const safety = useSafetyAPI();
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [done, setDone] = useState(false);
  const copy = SAFETY_DIALOG_COPY[mode];
  const mutation = mode === "report" ? safety.report : safety.block;
  const busy = mutation.isPending;

  /** Sends only the confirmed action; a failure stays in mutation state for the dialog to show. */
  const submit = async () => {
    if (busy) return;
    try {
      if (mode === "report") await safety.report.mutateAsync({ targetKind, targetId, reason });
      else if (userId) await safety.block.mutateAsync(userId);
      else return;
      setDone(true);
    } catch {
      /* The error remains in mutation state and is shown in the dialog. */
    }
  };

  return (
    <Modal
      title={done ? copy.doneTitle : copy.title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {done ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-ink-soft">
            {copy.done}
          </p>
          <button
            type="button"
            className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">{copy.prompt}</p>
          {mode === "report" ? (
            <fieldset disabled={busy} className="space-y-2">
              <legend className="sr-only">Report reason</legend>
              {REPORT_REASONS.map((entry) => (
                <label key={entry.value} className="flex gap-2 text-sm">
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === entry.value}
                    onChange={() => setReason(entry.value)}
                  />
                  {entry.label}
                </label>
              ))}
            </fieldset>
          ) : null}
          {mutation.error ? (
            <p role="alert" className="text-sm text-neg-700">
              {errorMessage(mutation.error)}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white disabled:opacity-50"
            onClick={submit}
          >
            {busy ? "Sending…" : copy.confirm}
          </button>
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-lg border border-line p-3"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      )}
    </Modal>
  );
}

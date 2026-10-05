"use client";
/** Private report and block controls beside visible content. */

import { useState } from "react";
import { REPORT_REASONS, BLOCK_EXPLANATION, type ReportTargetKind } from "@haalkhata/shared/safety/safety";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/connect";
import { useSafetyAPI } from "./hooks/useSafetyAPI";

/**
 * Confirms safety actions and displays errors without revealing the reporter.
 * @param props Visible target and optional person to block.
 * @returns Safety controls and confirmation dialog.
 */
export function SafetyActions({ targetKind, targetId, userId }: { targetKind: ReportTargetKind; targetId: string; userId?: string }) {
  const safety = useSafetyAPI();
  const [mode, setMode] = useState<"report" | "block" | null>(null);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [notice, setNotice] = useState("");
  const busy = safety.report.isPending || safety.block.isPending;
  const failure = mode === "report" ? safety.report.error : safety.block.error;
  const blocked = safety.blocks.data?.users.some((person) => person.id === userId);
  /** Sends only the confirmed action; failed mutations remain retryable. */
  const submit = async () => {
    try {
      if (mode === "report") { await safety.report.mutateAsync({ targetKind, targetId, reason }); setNotice("Report received. Our support team will review it. Your report is private."); }
      else if (userId) { await safety.block.mutateAsync(userId); setNotice("Person blocked. Manage blocked people in Account."); }
      setMode(null);
    } catch { /* Error remains in mutation state and is shown in the dialog. */ }
  };
  return <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft">
      <button type="button" className="py-2 underline" onClick={() => { safety.report.reset(); setMode("report"); }}>Report</button>
      {userId && !blocked ? <button type="button" className="py-2 underline" onClick={() => { safety.block.reset(); setMode("block"); }}>Block person</button> : null}
      {blocked ? <span>Blocked</span> : null}
    </div>
    {notice ? <p role="status" className="text-xs text-ink-soft">{notice}</p> : null}
    {mode ? <Modal title={mode === "report" ? "Report a safety concern" : "Block this person?"} onClose={() => { if (!busy) setMode(null); }}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">{mode === "block" ? BLOCK_EXPLANATION : "Choose a reason. The person you report is not notified. Contact Support for urgent help."}</p>
        {mode === "report" ? <fieldset disabled={busy} className="space-y-2"><legend className="sr-only">Report reason</legend>{REPORT_REASONS.map((entry) => <label key={entry.value} className="flex gap-2 text-sm">
          <input type="radio" name="report-reason" checked={reason === entry.value} onChange={() => setReason(entry.value)} />{entry.label}
        </label>)}</fieldset> : null}
        {failure ? <p role="alert" className="text-sm text-neg-700">{errorMessage(failure)}</p> : null}
        <button type="button" disabled={busy} className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white disabled:opacity-50" onClick={submit}>{busy ? "Sending…" : mode === "report" ? "Send report" : "Confirm block"}</button>
        <button type="button" disabled={busy} className="w-full rounded-lg border border-line p-3" onClick={() => setMode(null)}>Cancel</button>
      </div>
    </Modal> : null}
  </div>;
}

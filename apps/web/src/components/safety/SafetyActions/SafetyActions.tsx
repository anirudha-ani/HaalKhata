"use client";
/** Private report and block controls beside visible content. */

import { useState } from "react";
import { type ReportTargetKind, type SafetyDialogMode } from "@haalkhata/shared/safety/safety";
import { useSafetyAPI } from "@/lib/hooks/useSafetyAPI";
import { SafetyDialog } from "../SafetyDialog/SafetyDialog";

/**
 * Offers "Report" and, for another person, "Block person" beside the
 * content they concern. Each opens the confirmation dialog, which carries
 * its own errors and its own confirmation without revealing the reporter.
 * @param props Visible target and optional person to block.
 * @returns Safety controls and confirmation dialog.
 */
export function SafetyActions({ targetKind, targetId, userId }: { targetKind: ReportTargetKind; targetId: string; userId?: string }) {
  const safety = useSafetyAPI();
  const [mode, setMode] = useState<SafetyDialogMode | null>(null);
  const blocked = safety.blocks.data?.users.some((person) => person.id === userId);
  return <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft">
      <button type="button" className="py-2 underline" onClick={() => setMode("report")}>Report</button>
      {userId && !blocked ? <button type="button" className="py-2 underline" onClick={() => setMode("block")}>Block person</button> : null}
      {blocked ? <span>Blocked</span> : null}
    </div>
    {mode ? <SafetyDialog mode={mode} targetKind={targetKind} targetId={targetId} userId={userId} onClose={() => setMode(null)} /> : null}
  </div>;
}

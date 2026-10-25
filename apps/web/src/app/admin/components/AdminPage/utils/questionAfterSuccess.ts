/** Decides which confirmation question stays open once an action on the report queue succeeds. */

import type { ReportAction } from "../hooks/useReportQueue";

/**
 * The question still open after an action succeeds: closed when it is the
 * question that led to that action, left as it is otherwise.
 *
 * Dismissing on one card does not wait for a question open on another, so
 * an action finishing is not a reason to close whatever question is open:
 * that question was never answered or cancelled.
 *
 * @param open - The question open when the action finished, if any.
 * @param succeeded - The action that just succeeded.
 * @returns The question to keep open, or null.
 */
export function questionAfterSuccess(
  open: ReportAction | null,
  succeeded: ReportAction,
): ReportAction | null {
  if (open?.reportId === succeeded.reportId && open.action === succeeded.action) return null;
  return open;
}

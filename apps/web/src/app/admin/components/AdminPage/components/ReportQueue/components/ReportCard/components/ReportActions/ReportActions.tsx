"use client";
/** Report actions: the buttons under a reported item, and why one is missing when it is. */

import {
  DELETED_AUTHOR_NOTE,
  MERGED_AUTHOR_NOTE,
  type ModerationAction,
} from "../../../../../../constants/moderation";

/**
 * Renders what can be done about one reported item. Dismiss and Resume run
 * at once; Remove and Suspend open a question first. Only what the server
 * would accept is offered: Resume for a suspended author, and no suspend at
 * all, with the reason said, for an account merged into another or deleted
 * by its person. The last
 * failure on this item is shown right under the buttons.
 *
 * @param props - Component props.
 * @returns The action row.
 */
export function ReportActions({
  removeLabel,
  authorActive,
  authorDeleted,
  authorSuspended,
  running,
  anyRunning,
  error,
  onAsk,
  onRun,
}: {
  /** The remove button's label for this kind of content. */
  removeLabel: string;
  /** Whether the author's account still stands for a person. */
  authorActive: boolean;
  /** Whether it stopped because the person deleted it, rather than merged it. */
  authorDeleted: boolean;
  /** Whether the author is suspended now. */
  authorSuspended: boolean;
  /** The action running on this item, if any. */
  running: ModerationAction | null;
  /** Whether any action is running anywhere on the page. */
  anyRunning: boolean;
  /** Why the last action on this item failed; empty when it did not. */
  error: string;
  /** Opens the question for an action. */
  onAsk: (action: ModerationAction) => void;
  /** Runs an action. */
  onRun: (action: ModerationAction) => void;
}) {
  const quiet =
    "rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink disabled:opacity-50";
  const serious =
    "rounded-lg border border-neg-600/30 bg-card px-3 py-1.5 text-sm font-semibold text-neg-700 hover:bg-neg-50 disabled:opacity-50";

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onRun("dismiss")} disabled={anyRunning} className={quiet}>
          {running === "dismiss" ? "Dismissing…" : "Dismiss"}
        </button>
        <button type="button" onClick={() => onAsk("remove")} disabled={anyRunning} className={serious}>
          {removeLabel}
        </button>
        {authorActive && authorSuspended ? (
          <button type="button" onClick={() => onRun("resume")} disabled={anyRunning} className={quiet}>
            {running === "resume" ? "Resuming…" : "Resume author"}
          </button>
        ) : null}
        {authorActive && !authorSuspended ? (
          <button type="button" onClick={() => onAsk("suspend")} disabled={anyRunning} className={serious}>
            Suspend author
          </button>
        ) : null}
      </div>
      {authorActive ? null : (
        <p className="mt-2 text-xs text-ink-soft">
          {authorDeleted ? DELETED_AUTHOR_NOTE : MERGED_AUTHOR_NOTE}
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-neg-700">
          {error}
        </p>
      ) : null}
    </>
  );
}

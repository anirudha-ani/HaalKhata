"use client";
/** Report card: one piece of reported content, why it was reported, who wrote it, and what can be done. */

import type { ReportedContent } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { localDateTime } from "@haalkhata/shared/time/localTime";
import { WITHHELD_NAME_LABEL } from "../../../../constants/adminPage";
import {
  SUSPEND_EFFECT,
  TARGET_KIND_WORDING,
  type ModerationAction,
} from "../../../../constants/moderation";
import { reasonsLine } from "../../../../utils/reasonsLine";
import { ConfirmAction } from "./components/ConfirmAction/ConfirmAction";
import { AuthorLine } from "./components/AuthorLine/AuthorLine";
import { ReportActions } from "./components/ReportActions/ReportActions";
import { ReportedWords } from "./components/ReportedWords/ReportedWords";

/**
 * Renders one entry of the queue: the reported words as they were reported,
 * the reasons, the author's display name, and the actions.
 *
 * The words are shown as text, never as markup, and wrap however long they
 * are. Nothing on the card says who reported it; the server never says.
 *
 * Removing and suspending ask first, in place of the action row, saying
 * exactly what will happen.
 *
 * @param props - Component props.
 * @returns The card.
 */
export function ReportCard({
  entry,
  confirming,
  running,
  anyRunning,
  error,
  onAsk,
  onRun,
  onCancel,
}: {
  /** The reported content and its reports. */
  entry: ReportedContent;
  /** The action whose question is open on this card, if any. */
  confirming: ModerationAction | null;
  /** The action running on this card, if any. */
  running: ModerationAction | null;
  /** Whether any action is running anywhere on the page. */
  anyRunning: boolean;
  /** Why the last action on this card failed; empty when it did not. */
  error: string;
  /** Opens the question for an action. */
  onAsk: (action: ModerationAction) => void;
  /** Runs an action. */
  onRun: (action: ModerationAction) => void;
  /** Closes the question. */
  onCancel: () => void;
}) {
  const wording = TARGET_KIND_WORDING[entry.targetKind] ?? {
    label: entry.targetKind,
    removeLabel: "Remove",
    removeEffect: "",
  };
  const author = entry.author;
  const authorName = author?.name || WITHHELD_NAME_LABEL;
  const timesReported = entry.reportCount === 1 ? "Reported once" : `Reported ${entry.reportCount} times`;

  return (
    <article className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink-soft ring-1 ring-line">
          {wording.label}
        </span>
        <span className="text-sm font-semibold">{reasonsLine(entry.reasons)}</span>
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {timesReported}, first on {localDateTime(entry.firstReportedAt)}
      </p>

      <ReportedWords text={entry.text} notes={entry.notes} itemNames={entry.itemNames} />
      <AuthorLine
        name={authorName}
        suspended={author?.suspended ?? false}
        othersWaiting={(author?.openReportCount ?? 1) - 1}
      />

      {confirming ? (
        <ConfirmAction
          effect={confirming === "remove" ? wording.removeEffect : SUSPEND_EFFECT}
          confirmLabel={confirming === "remove" ? wording.removeLabel : `Suspend ${authorName}`}
          isRunning={running === confirming}
          isBlocked={anyRunning}
          error={error}
          onConfirm={() => onRun(confirming)}
          onCancel={onCancel}
        />
      ) : (
        <ReportActions
          removeLabel={wording.removeLabel}
          authorActive={author?.active ?? false}
          authorDeleted={author?.deleted ?? false}
          authorSuspended={author?.suspended ?? false}
          running={running}
          anyRunning={anyRunning}
          error={error}
          onAsk={onAsk}
          onRun={onRun}
        />
      )}
    </article>
  );
}

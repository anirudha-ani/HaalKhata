"use client";
/** Confirm action: the question asked before an action that cannot be taken back from this page. */

import { useEffect, useRef } from "react";

/**
 * Says exactly what an action will do and asks before doing it. A failure
 * is shown inside the question, beside the button that caused it, and the
 * question stays open so the operator can try again or cancel.
 *
 * Focus moves to Cancel when the question opens: the button that opened it
 * is gone, and the safe choice is the one a stray Enter should land on.
 *
 * Confirming waits while any action runs, here or on another card: the
 * page runs one at a time, and a second one started over the first would
 * take its place and drop whatever the first one answered. Cancelling only
 * closes the question, so it waits only for this question's own action.
 *
 * @param props - Component props.
 * @returns The question.
 */
export function ConfirmAction({
  effect,
  confirmLabel,
  isRunning,
  isBlocked,
  error,
  onConfirm,
  onCancel,
}: {
  /** The whole of what the action does. */
  effect: string;
  /** The confirm button's label: the action itself, not "OK". */
  confirmLabel: string;
  /** Whether this action is running now. */
  isRunning: boolean;
  /** Whether any action is running now, this one or another card's. */
  isBlocked: boolean;
  /** Why the last attempt failed; empty when it did not. */
  error: string;
  /** Runs the action. */
  onConfirm: () => void;
  /** Closes the question without doing anything. */
  onCancel: () => void;
}) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  return (
    <div className="mt-4 rounded-xl bg-neg-50 p-3 ring-1 ring-neg-600/20">
      <p className="text-sm">{effect}</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-neg-700">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isBlocked}
          className="rounded-lg bg-neg-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neg-700 disabled:opacity-50"
        >
          {isRunning ? "Working…" : confirmLabel}
        </button>
        <button
          ref={cancelButton}
          type="button"
          onClick={onCancel}
          disabled={isRunning}
          className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

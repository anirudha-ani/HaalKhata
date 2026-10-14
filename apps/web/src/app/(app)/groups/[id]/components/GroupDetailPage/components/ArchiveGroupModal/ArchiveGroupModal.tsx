"use client";
/** Archive popup: a blocked explanation or a confirmation with the consequences. */

import { Modal } from "@/components/ui/Modal/Modal";
import {
  GROUP_ARCHIVE_DIALOG_ACTIONS,
  type GroupArchivePrompt,
} from "@haalkhata/shared/group/archivePrompt";
import { GROUP_ARCHIVE_ACTIONS } from "@haalkhata/shared/group/archiving";

/**
 * Shows archive feedback at the moment the user asks, before any mutation.
 *
 * @param props - Popup wording, mutation feedback and action callbacks.
 * @returns The archive explanation or confirmation dialog.
 */
export function ArchiveGroupModal({
  prompt,
  pending,
  error,
  onConfirm,
  onClose,
  onViewBalances,
}: {
  /** Explanation or confirmation chosen from current balances. */
  prompt: GroupArchivePrompt;
  /** Whether the confirmed change is being saved. */
  pending: boolean;
  /** Server refusal, retained inside the popup. */
  error: string;
  /** Saves the confirmed archive state. */
  onConfirm: () => void;
  /** Dismisses the popup without changing the group. */
  onClose: () => void;
  /** Dismisses a blocked popup and opens the group's balances. */
  onViewBalances: () => void;
}) {
  return (
    <Modal title={prompt.title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-soft">{prompt.detail}</p>
        {error ? <p role="alert" className="text-sm text-brand-600">{error}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            autoFocus
            disabled={pending}
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {prompt.confirmLabel ? GROUP_ARCHIVE_DIALOG_ACTIONS.cancel : GROUP_ARCHIVE_DIALOG_ACTIONS.close}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={prompt.confirmLabel ? onConfirm : onViewBalances}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? GROUP_ARCHIVE_ACTIONS.saving : prompt.confirmLabel ?? GROUP_ARCHIVE_DIALOG_ACTIONS.balances}
          </button>
        </div>
      </div>
    </Modal>
  );
}

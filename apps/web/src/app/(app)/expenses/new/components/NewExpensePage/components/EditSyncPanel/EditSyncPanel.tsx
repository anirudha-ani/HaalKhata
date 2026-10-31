"use client";
/** What other people saved while this form was open: a note, and the choice when both changed the same thing. */

import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Stays pinned at the bottom of the form column as it scrolls: somebody can
 * be anywhere on a long form when another person's change arrives, and a
 * choice that stops them saving must not be off screen.
 *
 * @param props - The form controller.
 * @returns The panel, or nothing when there is nothing to say.
 */
export function EditSyncPanel({ form }: { form: NewExpenseController }) {
  if (!form.editNote && form.editConflicts.length === 0) return null;
  return (
    <div className="sticky bottom-4 z-10 space-y-3 rounded-xl border border-line bg-card p-3 shadow-lg">
      {form.editNote ? <p role="status" className="text-sm text-ink-soft">{form.editNote}</p> : null}
      {form.editConflicts.map(({ key, text, conflict }) => (
        <div key={key} className="space-y-2">
          <p role="alert" className="text-sm font-medium">{text}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => form.keepMyEdit(conflict)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Keep mine
            </button>
            <button
              type="button"
              onClick={() => form.takeSavedEdit(conflict)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-paper"
            >
              Use {form.editChangedBy}’s
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

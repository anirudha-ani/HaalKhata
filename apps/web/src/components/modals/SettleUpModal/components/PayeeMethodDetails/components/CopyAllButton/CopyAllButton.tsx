"use client";
/** The "Copy all" button of a payee's details: every line at once, labelled. */

import { Check, ClipboardList, TriangleAlert } from "lucide-react";
import { COPY_FAILED_LABEL } from "@haalkhata/shared/payment/copy";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";

/**
 * Renders a button that copies a whole method as labelled lines, for
 * pasting into a banking app's notes or a chat. Confirms only when the copy
 * actually happened, and says so when it did not.
 *
 * @param props - Component props.
 * @returns The button.
 */
export function CopyAllButton({
  text,
}: {
  /** What the button puts on the clipboard. */
  text: string;
}) {
  const { outcome, copy } = useCopyFeedback();

  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card text-sm font-medium text-ink-soft hover:border-brand-500 hover:text-brand-700"
    >
      {outcome === "copied" ? (
        <Check className="h-4 w-4 text-pos-600" aria-hidden="true" />
      ) : outcome === "failed" ? (
        <TriangleAlert className="h-4 w-4 text-brand-600" aria-hidden="true" />
      ) : (
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
      )}
      <span aria-live="polite">
        {outcome === "copied" ? "Copied" : outcome === "failed" ? COPY_FAILED_LABEL : "Copy all"}
      </span>
    </button>
  );
}

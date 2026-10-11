"use client";
/** One detail of the method being paid into: its label, its value in full, and a Copy button. */

import { Check, Copy, TriangleAlert } from "lucide-react";
import { COPY_FAILED_LABEL } from "@haalkhata/shared/payment/copy";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";

/**
 * Renders one labelled value a payer needs, with its own Copy button.
 *
 * The value wraps and is never cut short. An ellipsis is harmless on a
 * username and wrong on an account number: a payer who types what they see
 * must be seeing all of it.
 *
 * The button says "Copied" only when the copy happened, and says so when it
 * did not: a browser can refuse the clipboard, and a payer who is told
 * nothing pastes whatever was there before.
 *
 * @param props - Component props.
 * @returns The line.
 */
export function DetailLine({
  label,
  value,
  copyValue,
}: {
  /** What the value is, e.g. "Account number". */
  label: string;
  /** The value as a person reads it. */
  value: string;
  /** What the Copy button puts on the clipboard. */
  copyValue: string;
}) {
  const { outcome, copy } = useCopyFeedback();

  return (
    <li className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-soft">{label}</p>
        <p className="font-mono text-sm break-all select-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy(copyValue)}
        aria-label={`Copy ${label}`}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-medium text-ink-soft hover:border-brand-500 hover:text-brand-700"
      >
        {outcome === "copied" ? (
          <Check className="h-4 w-4 text-pos-600" aria-hidden="true" />
        ) : outcome === "failed" ? (
          <TriangleAlert className="h-4 w-4 text-brand-600" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        <span aria-live="polite">
          {outcome === "copied" ? "Copied" : outcome === "failed" ? COPY_FAILED_LABEL : "Copy"}
        </span>
      </button>
    </li>
  );
}

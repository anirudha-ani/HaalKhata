"use client";
/** One detail of the method being paid into: its label, its value in full, and a Copy button. */

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard/copyText";
import { COPIED_BADGE_MS } from "../../constants/copy";

/**
 * Renders one labelled value a payer needs, with its own Copy button.
 *
 * The value wraps and is never cut short. An ellipsis is harmless on a
 * username and wrong on an account number: a payer who types what they see
 * must be seeing all of it.
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
  const [copied, setCopied] = useState(false);

  /**
   * Copies the value and flips the button to a confirmation. Only confirms
   * on success: `navigator.clipboard` is absent outside a secure context,
   * and saying "Copied" when nothing was copied is worse than saying nothing.
   */
  const copy = async () => {
    if (!(await copyText(copyValue))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPIED_BADGE_MS);
  };

  return (
    <li className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-soft">{label}</p>
        <p className="font-mono text-sm break-all select-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-medium text-ink-soft hover:border-brand-500 hover:text-brand-700"
      >
        {copied ? (
          <Check className="h-4 w-4 text-pos-600" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </li>
  );
}

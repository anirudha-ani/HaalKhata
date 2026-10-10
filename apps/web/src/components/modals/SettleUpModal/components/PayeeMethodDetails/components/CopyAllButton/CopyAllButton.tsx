"use client";
/** The "Copy all" button of a payee's details: every line at once, labelled. */

import { useState } from "react";
import { Check, ClipboardList } from "lucide-react";
import { copyText } from "@/lib/clipboard/copyText";
import { COPIED_BADGE_MS } from "../../constants/copy";

/**
 * Renders a button that copies a whole method as labelled lines, for
 * pasting into a banking app's notes or a chat. Confirms only when the copy
 * actually happened.
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
  const [copied, setCopied] = useState(false);

  /** Copies the text and flips the button to a confirmation for a moment. */
  const copy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPIED_BADGE_MS);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card text-sm font-medium text-ink-soft hover:border-brand-500 hover:text-brand-700"
    >
      {copied ? (
        <Check className="h-4 w-4 text-pos-600" aria-hidden="true" />
      ) : (
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy all"}
    </button>
  );
}

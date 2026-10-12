"use client";
/** Copying text to the clipboard and saying, for a moment, whether it got there. */

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard/copyText";
import { COPIED_BADGE_MS } from "../constants/copy";

/** What a Copy button is showing: nothing yet, that it worked, or that it did not. */
export type CopyOutcome = "idle" | "copied" | "failed";

/**
 * Copies text and reports the outcome for a moment.
 *
 * A browser can refuse a clipboard write (permissions, an embedded view),
 * and a button that stays as it was after a press leaves the payer pasting
 * whatever was on the clipboard before. So the failure is said as plainly as
 * the success.
 *
 * @returns The current outcome, and the function that copies.
 */
export function useCopyFeedback() {
  const [outcome, setOutcome] = useState<CopyOutcome>("idle");

  // The badge clears itself, and stops waiting if the button goes away.
  useEffect(() => {
    if (outcome === "idle") return;
    const timer = window.setTimeout(() => setOutcome("idle"), COPIED_BADGE_MS);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  /**
   * Puts text on the clipboard and records whether it arrived.
   *
   * @param text - What to copy.
   */
  const copy = async (text: string) => {
    setOutcome((await copyText(text)) ? "copied" : "failed");
  };

  return { outcome, copy };
}

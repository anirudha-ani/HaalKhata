"use client";
/** Member feedback note: the failure or confirmation an action in the members list produced, shown where the action was taken. */

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useRevealOnMount } from "../../hooks/useRevealOnMount";

/**
 * Renders one outcome line. A failure is announced as an alert and a success
 * as a status, so a screen reader hears either without the list being
 * re-read.
 *
 * @param props - Component props.
 * @returns The note.
 */
export function MemberFeedbackNote({
  tone,
  message,
  indented = false,
}: {
  /** Whether the message reports a failure or a success. */
  tone: "error" | "success";
  /** The sentence to show. */
  message: string;
  /** Whether to line the note up under a member's name, past the avatar. */
  indented?: boolean;
}) {
  const failed = tone === "error";
  const noteRef = useRevealOnMount<HTMLParagraphElement>();
  return (
    <p
      ref={noteRef}
      role={failed ? "alert" : "status"}
      className={`flex scroll-my-5 items-start gap-2 rounded-lg px-3 py-2 text-sm ${
        failed ? "bg-brand-50 text-brand-700" : "bg-pos-50 text-pos-700"
      } ${indented ? "sm:ml-10" : ""}`}
    >
      {failed ? (
        <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="min-w-0 first-letter:uppercase">{message}</span>
    </p>
  );
}

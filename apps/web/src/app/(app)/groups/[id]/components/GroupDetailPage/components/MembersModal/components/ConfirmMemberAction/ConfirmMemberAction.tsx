"use client";
/** Confirm member action: the question a member's row turns into before removing them, leaving, or handing over the group. */

import { useEffect, useRef } from "react";
import type { MemberActionPrompt } from "@haalkhata/shared/group/memberActions";
import { useRevealOnMount } from "../../hooks/useRevealOnMount";
import { CONFIRM_GUARD_MS } from "./constants/confirmMemberAction";

/**
 * Renders the second step of a member action: what is about to happen, what
 * it costs, and a way out.
 *
 * It takes the place of the row's buttons instead of opening over them. The
 * question is the first thing in that place and the two buttons sit under
 * it, so a second tap that lands where the first one did hits the wording,
 * not "go ahead". Position alone is not a guarantee, though: the block
 * scrolls itself into view when its row is at the bottom of the list, which
 * moves it under the finger. So the confirm button also ignores taps for the
 * first moment after it appears — a double tap cannot confirm by accident.
 * Focus moves to Cancel for the same reason: the safe answer is the default.
 *
 * @param props - Component props.
 * @returns The confirmation block.
 */
export function ConfirmMemberAction({
  prompt,
  onConfirm,
  onCancel,
}: {
  /** The question, its consequence, and the confirm button's caption. */
  prompt: MemberActionPrompt;
  /** Called when the action should go ahead. */
  onConfirm: () => void;
  /** Called when the person backs out. */
  onCancel: () => void;
}) {
  const blockRef = useRevealOnMount<HTMLDivElement>();
  // When the block appeared; Infinity until it has, so nothing can confirm
  // before then either.
  const shownAt = useRef(Number.POSITIVE_INFINITY);
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);
  return (
    <div
      ref={blockRef}
      role="group"
      aria-label={prompt.question}
      className="scroll-my-5 space-y-2.5 rounded-xl bg-paper p-3 sm:ml-10"
    >
      <p className="text-sm">
        <span className="font-semibold">{prompt.question}</span>{" "}
        <span className="text-ink-soft">{prompt.detail}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          // The button that was just tapped is gone, so focus has to land
          // somewhere, and Cancel is the safe place.
          autoFocus
          onClick={onCancel}
          className="rounded-lg border border-line bg-card py-2 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (performance.now() - shownAt.current < CONFIRM_GUARD_MS) return;
            onConfirm();
          }}
          className="rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {prompt.confirmLabel}
        </button>
      </div>
    </div>
  );
}

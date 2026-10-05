"use client";
/** Member action blocked: what a member's row says when they cannot leave or be removed until a balance is settled. */

import type { MemberRemovalBlock } from "@haalkhata/shared/group/memberActions";
import { useRevealOnMount } from "../../hooks/useRevealOnMount";

/**
 * Renders the refusal in place of a confirmation: who cannot go, what is
 * outstanding, and the way to the balances where it gets settled.
 *
 * The server would refuse the removal anyway. Showing this instead of a
 * confirm button means the request that can only fail is never sent, and
 * the person learns why, and how much, at the moment they ask.
 *
 * @param props - Component props.
 * @returns The blocked notice.
 */
export function MemberActionBlocked({
  block,
  onViewBalances,
  onClose,
}: {
  /** The refusal in words. */
  block: MemberRemovalBlock;
  /** Takes the person to the group's balances. */
  onViewBalances: () => void;
  /** Called when the person dismisses the notice. */
  onClose: () => void;
}) {
  const blockRef = useRevealOnMount<HTMLDivElement>();
  return (
    <div
      ref={blockRef}
      role="alert"
      className="scroll-my-5 space-y-2.5 rounded-xl bg-neg-50 p-3 sm:ml-10"
    >
      <p className="text-sm">
        <span className="font-semibold">{block.title}.</span>{" "}
        <span className="text-ink-soft">{block.detail}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line bg-card py-2 text-sm font-semibold"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onViewBalances}
          className="rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          See balances
        </button>
      </div>
    </div>
  );
}

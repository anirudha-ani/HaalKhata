"use client";
/** Entry detail: one statement line's name, the tags that qualify it, and the control that removes a payment. */

import Link from "next/link";
import type { FriendLedgerEntry } from "@haalkhata/protogen/expense/v1/expense_pb";
import { ENTRY_TAG_CLASS } from "./constants/entryDetail";

/**
 * Renders what a statement line is: its name, then everything a reader needs
 * to take it the right way — whether money moved, whether it still counts,
 * who recorded it, which group it belongs to — and, on a payment, the way to
 * take it back.
 *
 * The parts wrap as a row of chips, so the same markup fits a table cell and
 * a phone-width block without anything running off the side.
 *
 * @param props - Component props.
 * @returns The line's detail.
 */
export function EntryDetail({
  entry,
  netTag,
  isConfirming,
  isRemoving,
  removalError,
  onRemove,
}: {
  /** The statement line. */
  entry: FriendLedgerEntry;
  /** What the line was within a net settlement, or "" when it was not part of one. */
  netTag: string;
  /** True once the first tap has armed this line's Remove. */
  isConfirming: boolean;
  /** True while this line's removal is in flight. */
  isRemoving: boolean;
  /** Why this line's removal was refused, or "". */
  removalError: string;
  /** Called on each tap of Remove; the caller counts the taps. */
  onRemove: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {entry.kind === "expense" ? (
          <Link
            href={`/expenses/${entry.id}`}
            className={`min-w-0 font-medium hover:text-brand-600 ${
              entry.deleted ? "text-ink-soft line-through" : ""
            }`}
          >
            {entry.description}
          </Link>
        ) : (
          // A cancelled balance is not a payment and is not drawn as one:
          // nobody received that money.
          <span
            className={`min-w-0 font-medium ${
              entry.deleted
                ? "text-ink-soft line-through"
                : entry.offset
                  ? "text-ink"
                  : "text-pos-700"
            }`}
          >
            {entry.description}
          </span>
        )}
        {/* A net settlement is one payment plus the balances it cancelled
            against each other. Each of its lines says which it is, so the
            cash that moved is never confused with the amounts that only
            cancelled. */}
        {netTag ? <span className={ENTRY_TAG_CLASS}>{netTag}</span> : null}
        {/* Struck through but kept: a deleted expense or a removed payment no
            longer moves the balance, and the line is what explains why the
            balance leans the way it does now. */}
        {entry.deleted ? (
          <span className={ENTRY_TAG_CLASS}>
            {entry.kind === "settlement" ? "removed" : "deleted"}
          </span>
        ) : null}
        {/* A payment is a claim one of the two of you typed in; the
            statement says which, on every line. */}
        {entry.recordedByName ? (
          <span className={ENTRY_TAG_CLASS}>recorded by {entry.recordedByName}</span>
        ) : null}
        {entry.groupName ? <span className={ENTRY_TAG_CLASS}>{entry.groupName}</span> : null}
        {/* A mistyped payment is the reason this exists. Two taps: the first
            arms the button, the second sends. A cancelled balance has no
            remove of its own: it goes when the payment it belongs to goes,
            and the second tap says that is what will happen. */}
        {entry.kind === "settlement" && !entry.deleted && !entry.offset ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            aria-label={`Remove the payment ${entry.description}`}
            className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-soft hover:border-neg-600 hover:text-neg-600 disabled:opacity-50"
          >
            {isRemoving
              ? "Removing…"
              : isConfirming
                ? entry.netSettlementId
                  ? "Tap again: removes it and everything it cancelled"
                  : "Tap again to remove"
                : "Remove"}
          </button>
        ) : null}
      </div>
      {/* On the line that was tapped: the statement can be screens below
          anything shown at the top of the page. */}
      {removalError ? (
        <p role="alert" className="max-w-xs text-xs font-medium whitespace-normal text-neg-600">
          Not removed — {removalError}
        </p>
      ) : null}
    </div>
  );
}

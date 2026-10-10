"use client";
/** What a payer is told when the method they are about to pay into is new or was edited recently. */

import { useState } from "react";
import { recentChange } from "@haalkhata/shared/payment/formatMethod";

/**
 * Renders the note about a method's recent history.
 *
 * An edit is a warning: details that suddenly differ are how a payment gets
 * redirected, and the payer is the only one in a position to ask. A method
 * that was merely added says so in passing, because every method is new
 * once and a warning on all of them is a warning nobody reads.
 *
 * @param props - Component props.
 * @returns The note; nothing for a method untouched for two weeks.
 */
export function ChangeNote({
  createdAt,
  updatedAt,
  firstName,
}: {
  /** When the method was added (ISO 8601). */
  createdAt: string;
  /** When its details last changed (ISO 8601). */
  updatedAt: string;
  /** First name of the method's owner, the person to check with. */
  firstName: string;
}) {
  // Read once per mount: the clock is not a render input, and a note that
  // is right when the dialog opens is right for as long as it stays open.
  const [openedAtMs] = useState(() => Date.now());
  const change = recentChange({ createdAt, updatedAt }, openedAtMs);

  if (!change) return null;
  if (!change.edited) return <p className="text-xs text-ink-soft">{change.text}.</p>;
  return (
    <p className="rounded-lg bg-neg-50 px-3 py-2 text-xs font-medium text-neg-700">
      {change.text}. If that is unexpected, check with {firstName} before you pay.
    </p>
  );
}

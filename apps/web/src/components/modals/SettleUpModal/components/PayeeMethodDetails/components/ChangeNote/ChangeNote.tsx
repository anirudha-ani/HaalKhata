"use client";
/** What a payer is told when the method they are about to use changed recently. */

import { useState } from "react";
import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { changeClock, recentChange } from "@haalkhata/shared/payment/formatMethod";

/**
 * Renders a line about how recently a method came to be what the payer is
 * being shown.
 *
 * Edited details, a method that replaced another, and a method that only
 * recently became the preferred one are each a warning: that is how a
 * payment gets redirected, and the payer is the only one in a position to
 * ask. A method that is simply new is said quietly, since everyone's are new
 * once.
 *
 * It sits at the top of the card, above the first Copy button, so it is read
 * before the details are used and not found afterwards under them.
 *
 * @param props - Component props.
 * @returns The line, or nothing when there is nothing recent to say.
 */
export function ChangeNote({
  method,
  methods,
  readAt,
  removedAt,
  firstName,
}: {
  /** The method being shown. */
  method: PaymentMethod;
  /** All of the payee's methods, to tell a first method from one that took over. */
  methods: readonly PaymentMethod[];
  /** The server's clock when the methods were read; "" when it sent none. */
  readAt: string;
  /** When the payee last removed a method; "" when never. */
  removedAt: string;
  /** First name of the person being paid, to say who to ask. */
  firstName: string;
}) {
  // The device's clock is read once per mount and only stands in when the
  // server sent none: the clock is not a render input.
  const [openedAtMs] = useState(() => Date.now());
  const change = recentChange(method, {
    nowMs: changeClock(readAt, openedAtMs),
    removedAt,
    methods,
  });

  if (!change) return null;
  if (!change.caution) return <p className="text-xs text-ink-soft">{change.text}.</p>;
  return (
    <p role="alert" className="rounded-lg bg-neg-50 px-3 py-2 text-xs font-medium text-neg-700">
      {change.text}. If that is unexpected, check with {firstName} before you pay.
    </p>
  );
}

"use client";
/** Buttons for the payment links a method's owner typed, each named by the site it opens. */

import { PaymentLink } from "../PaymentLink/PaymentLink";
import { ExternalLink } from "lucide-react";
import { linkHost } from "@haalkhata/shared/payment/formatMethod";

/**
 * Renders one "Open <host>" button per payment link.
 *
 * The owner typed these, so the button shows the host name rather than a
 * label of theirs: it is the one thing a payer can check before opening,
 * and a link whose host cannot be read is not offered at all.
 *
 * @param props - Component props.
 * @returns The buttons; nothing when the method has no usable link.
 */
export function OwnerLinks({
  links,
  onOpen,
}: {
  /** Checks a bill payment before opening the destination. */
  onOpen?: (url: string) => void;
  /** The values of the method's link details. */
  links: readonly string[];
}) {
  // Listed once each: the same link twice is one button, and one list key.
  return [...new Set(links)]
    .filter((link) => linkHost(link) !== "")
    .map((link) => (
      <PaymentLink
        key={link}
        url={link}
        onOpen={onOpen}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
        {/* Wrapped, never cut short. The end of a host name is the part that
            says whose site it is: "paypal.com.pay.example" cut to
            "paypal.com.pay…" would name the wrong one. */}
        <span className="min-w-0 break-all">Open {linkHost(link)}</span>
      </PaymentLink>
    ));
}

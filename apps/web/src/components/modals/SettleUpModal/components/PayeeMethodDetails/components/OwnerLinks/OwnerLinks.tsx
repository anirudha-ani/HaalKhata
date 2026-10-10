"use client";
/** Buttons for the payment links a method's owner typed, each named by the site it opens. */

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
}: {
  /** The values of the method's link details. */
  links: readonly string[];
}) {
  return links
    .filter((link) => linkHost(link) !== "")
    .map((link) => (
      <a
        key={link}
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">Open {linkHost(link)}</span>
      </a>
    ));
}

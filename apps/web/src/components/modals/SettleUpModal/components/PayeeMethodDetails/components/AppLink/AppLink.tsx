"use client";
/** The "Open Venmo" button of a built-in app, with the line that says what the link can and cannot do. */

import { ExternalLink } from "lucide-react";
import type { AppPaymentLink } from "@haalkhata/shared/payment/appLink";

/**
 * Renders the link into a built-in app, where it has one, and always the
 * line under it.
 *
 * The line is the honest part, and it is worked out with the link, in the
 * shared builder, so the two cannot disagree. It names the amount the link
 * carries, or says why it carries none: the app moves another currency, the
 * method is set up for another, or the app has no way to take one.
 *
 * @param props - Component props.
 * @returns The button (when there is a link to open) and the explanation.
 */
export function AppLink({
  link,
}: {
  /** The app's link and the line that goes with it. */
  link: AppPaymentLink;
}) {
  return (
    <>
      {link.url ? (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open {link.label}
        </a>
      ) : null}
      <p className="text-xs text-ink-soft">{link.hint}</p>
    </>
  );
}

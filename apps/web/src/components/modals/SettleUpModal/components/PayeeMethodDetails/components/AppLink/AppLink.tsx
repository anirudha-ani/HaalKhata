"use client";
/** The "Open Venmo" button of a built-in app, with the line that says what the link can and cannot do. */

import { ExternalLink } from "lucide-react";
import type { PaymentMethod as BuiltInApp } from "@haalkhata/shared/payment/methods";

/**
 * Renders the link into a built-in app, where it has one, and always the
 * line under it.
 *
 * The line is the honest part: it only claims a prefilled amount where the
 * app accepts one. Zelle has no universal link at all, and Cash App's link
 * cannot carry an amount, so each says so instead of leaving the payer to
 * find out inside the app.
 *
 * @param props - Component props.
 * @returns The button (when the app is linkable) and the explanation.
 */
export function AppLink({
  builtIn,
  link,
}: {
  /** The built-in app the method was started from. */
  builtIn: BuiltInApp;
  /** The link into the app for this payee; empty when the app has none. */
  link: string;
}) {
  return (
    <>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open {builtIn.label}
        </a>
      ) : null}
      <p className="text-xs text-ink-soft">
        {!builtIn.linkable
          ? `${builtIn.label} has no shareable link. Paste this into your banking app.`
          : builtIn.linkCarriesAmount
            ? `Opens ${builtIn.label} with the amount filled in. You still confirm it there.`
            : `${builtIn.label} can't carry an amount in a link. Type it in the app.`}
      </p>
    </>
  );
}

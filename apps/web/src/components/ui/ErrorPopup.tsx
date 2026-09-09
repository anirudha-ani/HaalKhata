"use client";
/** Floating error popup: a dismissible alert pinned to the top of the viewport. */

import { AlertCircle, X } from "lucide-react";
import { useEffect } from "react";
import { ERROR_POPUP_AUTO_DISMISS_MS } from "./ui.constants";

/**
 * Renders an error as a popup pinned to the top of the viewport, so it is
 * seen no matter where on the page the action that failed happened. A line
 * of text at the bottom of a long form is missed by whoever just tapped a
 * button at the top of it. Closes on the dismiss button or on its own after
 * {@link ERROR_POPUP_AUTO_DISMISS_MS}.
 *
 * Renders nothing when `message` is empty, so callers pass their error state
 * straight through.
 */
export function ErrorPopup({
  message,
  onDismiss,
}: {
  /** The error text to show; an empty string hides the popup. */
  message: string;
  /** Called when the popup closes, by tap or by timeout; should clear the message. */
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, ERROR_POPUP_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 shadow-lg"
      >
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
        <p className="flex-1 font-medium">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 rounded-full p-1 text-brand-600 hover:bg-brand-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

"use client";
/** Dialog shell (bottom sheet on mobile, centered on desktop) with Escape/backdrop close. */

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * Renders a dialog shell — a bottom sheet on mobile, a centered card on
 * desktop — with a titled header, a close button, and Escape/backdrop-click
 * dismissal.
 *
 * A `footer` is pinned under the body instead of scrolling with it. It is
 * for a form taller than a phone screen: an action that has scrolled out of
 * reach looks like a form with no way to finish it. The footer sits outside
 * the scrolling body, so a submit button in it names its form with the
 * `form` attribute.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  /** Heading text, also used as the dialog's accessible label. */
  title: string;
  /** Called when the user dismisses the dialog (close button, Escape, or backdrop click). */
  onClose: () => void;
  /** Dialog body content. */
  children: ReactNode;
  /** Content pinned to the bottom of the dialog while the body scrolls above it. */
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Without a footer the dialog itself scrolls, as it always has. With
        // one it becomes a column: the body scrolls, the footer stays put.
        className={`max-h-[92dvh] w-full rounded-t-2xl bg-card shadow-xl sm:max-w-md sm:rounded-2xl ${
          footer ? "flex flex-col overflow-hidden" : "overflow-y-auto p-5"
        }`}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className={footer ? "min-h-0 flex-1 overflow-y-auto p-5" : undefined}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-ink-soft hover:bg-paper"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

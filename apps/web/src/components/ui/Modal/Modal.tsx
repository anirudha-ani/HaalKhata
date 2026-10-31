"use client";
/** Dialog shell (bottom sheet on mobile, centered on desktop) with Escape/backdrop close. */

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "./hooks/useFocusTrap";

/**
 * Renders a dialog shell — a bottom sheet on mobile, a centered card on
 * desktop — with a titled header, a close button, and Escape/backdrop-click
 * dismissal.
 *
 * Dismissal is deliberate or it does not happen. Escape closes the dialog
 * only when nothing inside it used the key first: a picker that closes its
 * own list on Escape marks the event handled, and the dialog, with a form
 * half typed in it, stays. A click closes it only when it both started and
 * ended on the backdrop, so selecting text and letting go outside the card
 * does not.
 *
 * The keyboard stays inside it (see {@link useFocusTrap}). It is not a native
 * `<dialog>`: `showModal()` lifts one above everything, so an `ErrorPopup`
 * pinned on the page would sit behind its backdrop, unreadable.
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
      if (event.key !== "Escape" || event.defaultPrevented) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Whether the press that a click ends began on the backdrop itself.
  const pressedOnBackdrop = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(pressEvent) => {
        pressedOnBackdrop.current = pressEvent.target === pressEvent.currentTarget;
      }}
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget && pressedOnBackdrop.current) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Without a footer the dialog itself scrolls, as it always has. With
        // one it becomes a column: the body scrolls, the footer stays put.
        className={`max-h-[92dvh] w-full rounded-t-2xl bg-card shadow-xl outline-none sm:max-w-md sm:rounded-2xl ${
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

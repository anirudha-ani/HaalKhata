"use client";
/** Dialog shell (bottom sheet on mobile, centered on desktop) with Escape/backdrop close. */

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * Renders a dialog shell — a bottom sheet on mobile, a centered card on
 * desktop — with a titled header, a close button, and Escape/backdrop-click
 * dismissal.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  /** Heading text, also used as the dialog's accessible label. */
  title: string;
  /** Called when the user dismisses the dialog (close button, Escape, or backdrop click). */
  onClose: () => void;
  /** Dialog body content. */
  children: ReactNode;
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
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
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
    </div>
  );
}

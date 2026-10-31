/** Keeps the keyboard inside an open dialog and hands it back when the dialog closes. */

import { useEffect, useState, type RefObject } from "react";
import { TABBABLE_CONTROLS } from "../constants/focus";

/**
 * Lists what Tab can reach inside a dialog, leaving out anything hidden by
 * the current layout, which focus would skip anyway.
 *
 * @param dialog - The open dialog.
 * @returns Its controls, in page order.
 */
function tabbableWithin(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(TABBABLE_CONTROLS)).filter(
    (control) => control.checkVisibility?.() ?? true,
  );
}

/**
 * Treats a dialog as the whole page for a keyboard. Focus moves into it when
 * it opens, unless something inside already took it. Tab and Shift+Tab go
 * round its controls instead of walking out onto the page behind, and closing
 * it returns focus to whatever opened it. A dialog opened from inside another
 * answers Tab first, and the outer one leaves that press alone.
 *
 * @param dialogRef - The dialog element, which must be able to take focus.
 */
export function useFocusTrap(dialogRef: RefObject<HTMLElement | null>): void {
  // Read while rendering: by the time an effect runs, a field inside with
  // autoFocus has already taken focus and the opener can no longer be seen.
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const controls = tabbableWithin(dialog);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      // A dialog still in the page was not closed: React is only rehearsing.
      if (!dialog.isConnected && opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [dialogRef, opener]);
}

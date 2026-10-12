"use client";
/** Bringing the first problem of the payment method form into view when a save is refused. */

import { useEffect } from "react";
import { FORM_ERROR_SELECTOR, PAYMENT_METHOD_FORM_ID } from "../constants/paymentMethodForm";

/**
 * Scrolls the form's first error into view and puts the cursor in its field,
 * each time a save is attempted while something is wrong.
 *
 * The bank form is taller than a phone screen. Its Save button is pinned,
 * so it can be pressed with the offending field far above the viewport, and
 * a button that appears to do nothing is the one failure nobody can read.
 *
 * @param failedSaves - How many times a save has been refused; the effect
 *   runs when this moves, after the errors have been drawn.
 */
export function useScrollToFirstError(failedSaves: number): void {
  useEffect(() => {
    if (failedSaves === 0) return;
    const firstError = document
      .getElementById(PAYMENT_METHOD_FORM_ID)
      ?.querySelector<HTMLElement>(FORM_ERROR_SELECTOR);
    if (!firstError) return;
    firstError.scrollIntoView({ block: "center", behavior: "smooth" });
    // The error sits inside its field's wrapper; the control to fix is there.
    firstError
      .closest<HTMLElement>("label, li, [data-form-field]")
      ?.querySelector<HTMLElement>("input, select")
      ?.focus({ preventScroll: true });
  }, [failedSaves]);
}

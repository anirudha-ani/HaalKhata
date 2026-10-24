"use client";
/** The SMS code field's state: the shared code-field reducer, run so each change can be read at once, and the wait before a resend. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_CODE_FIELD,
  codeFieldReducer,
  readCodeField,
  type CodeFieldAction,
  type CodeFieldState,
} from "@haalkhata/shared/phone/codeField";
import type { CodeEntry } from "@haalkhata/shared/phone/verificationCode";

/**
 * Holds the code field of a phone verification step.
 *
 * The reducer runs against a ref of the latest state as well as updating
 * state: two changes can land before a re-render (a suggestion inserted
 * twice), and the second has to be read against the first rather than
 * against the render before both. It also lets a change hand back its
 * reading at once.
 *
 * The wait before the code can be sent again is counted from the clock,
 * once a second while it lasts, so a backgrounded app comes back showing
 * the right number.
 *
 * @returns The code, whether it is whole, the hint line, the seconds before
 *   a resend, and actions to read a change (returning the reading: any
 *   notice for the error line, and whether a whole code arrived at once),
 *   to clear the field, and to note that the code was sent or sent again.
 */
export function useVerificationCode() {
  const [field, setField] = useState<CodeFieldState>(EMPTY_CODE_FIELD);
  const latest = useRef<CodeFieldState>(EMPTY_CODE_FIELD);
  const [clock, setClock] = useState(() => Date.now());
  const view = readCodeField(field, clock);

  useEffect(() => {
    if (view.resendIn === 0) return undefined;
    const interval = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [view.resendIn]);

  const apply = useCallback((action: CodeFieldAction): CodeFieldState => {
    latest.current = codeFieldReducer(latest.current, action);
    setField(latest.current);
    return latest.current;
  }, []);

  const enter = useCallback(
    (entered: string): CodeEntry => apply({ type: "enter", entered }).lastEntry,
    [apply],
  );
  const clear = useCallback(() => {
    apply({ type: "clear" });
  }, [apply]);
  const markSent = useCallback(() => {
    const sentAt = Date.now();
    setClock(sentAt);
    apply({ type: "sent", at: sentAt });
  }, [apply]);
  const markResent = useCallback(() => {
    const sentAt = Date.now();
    setClock(sentAt);
    apply({ type: "resent", at: sentAt });
  }, [apply]);

  return { ...view, enter, clear, markSent, markResent };
}

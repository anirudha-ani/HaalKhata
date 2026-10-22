/** The SMS code field's state: the code, the line under it, and reading each change. */

import { useCallback, useRef, useState } from "react";
import {
  isCompleteVerificationCode,
  readVerificationCode,
} from "@haalkhata/shared/phone/verificationCode";
import {
  VERIFICATION_CODE_HINT,
  VERIFICATION_CODE_RESENT,
} from "@haalkhata/shared/phone/phone.constants";

/**
 * Holds the code field of a phone verification step.
 *
 * Each change is read against the code the field held just before it, which
 * is kept in a ref as well as in state: two changes can land before a
 * re-render (a suggestion inserted twice), and the second has to be read
 * against the first rather than against the render before both.
 *
 * @returns The code, whether it is whole, the hint line, and actions to read
 *   a change (returning any notice for the error line), to clear the field,
 *   and to note that the code was sent again.
 */
export function useVerificationCode() {
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);
  const latestCode = useRef("");

  const enter = useCallback((entered: string): string => {
    const entry = readVerificationCode(latestCode.current, entered);
    latestCode.current = entry.code;
    setCode(entry.code);
    return entry.notice;
  }, []);

  const clear = useCallback(() => {
    latestCode.current = "";
    setCode("");
    setResent(false);
  }, []);

  const markResent = useCallback(() => {
    latestCode.current = "";
    setCode("");
    setResent(true);
  }, []);

  return {
    code,
    /** True once the field holds a whole code, the only thing worth sending. */
    complete: isCompleteVerificationCode(code),
    /** The line under the field: which code to enter, or that it was sent again. */
    hint: resent ? VERIFICATION_CODE_RESENT : VERIFICATION_CODE_HINT,
    enter,
    clear,
    markResent,
  };
}

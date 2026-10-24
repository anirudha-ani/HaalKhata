/** The SMS code field as plain state and transitions, so the web and the mobile app hold one field and only draw it differently. */

import {
  CODE_RESEND_DELAY_SECONDS,
  VERIFICATION_CODE_HINT,
  VERIFICATION_CODE_RESEND,
  VERIFICATION_CODE_RESENT,
} from "./phone.constants";
import {
  isCompleteVerificationCode,
  readVerificationCode,
  type CodeEntry,
} from "./verificationCode";

/** Everything the code field remembers between renders. */
export interface CodeFieldState {
  /** Digits in the field. */
  code: string;
  /**
   * How the last change read: the notice for the error line, and whether a
   * whole code arrived that can be checked at once.
   */
  lastEntry: CodeEntry;
  /** True once the code was sent again, until the field is cleared. */
  resent: boolean;
  /** When the code was last sent (ms since the epoch), or null before any send. */
  sentAt: number | null;
}

/** One thing that happens to the field. */
export type CodeFieldAction =
  /** A change, with the field's whole text after it, unread. */
  | { type: "enter"; entered: string }
  /** Emptied: a code was refused, or the step was left. */
  | { type: "clear" }
  /** Emptied for a code just sent, starting the wait before it can be sent again. */
  | { type: "sent"; at: number }
  /** Emptied after the code was sent again, saying so and starting the wait again. */
  | { type: "resent"; at: number };

/** Everything the field draws that is worked out from its state. */
export interface CodeFieldView {
  /** Digits in the field. */
  code: string;
  /** True once the field holds a whole code, the only thing worth sending. */
  complete: boolean;
  /** The line under the field: which code to enter, or that it was sent again. */
  hint: string;
  /** Seconds before the code can be sent again; 0 when it can be now. */
  resendIn: number;
}

/** The reading of a field nothing has been entered in. */
const NO_ENTRY: CodeEntry = { code: "", notice: "", arrivedWhole: false };

/** An empty field, before anything was sent again. */
export const EMPTY_CODE_FIELD: CodeFieldState = {
  code: "",
  lastEntry: NO_ENTRY,
  resent: false,
  sentAt: null,
};

/**
 * Applies one action to the field. A change is read against the code the
 * state holds, so a caller that runs the reducer against the latest state
 * (not the last render's) reads two quick changes in order.
 *
 * @param state - The field before the action.
 * @param action - What happened.
 * @returns The field after it.
 */
export function codeFieldReducer(state: CodeFieldState, action: CodeFieldAction): CodeFieldState {
  switch (action.type) {
    case "enter": {
      const entry = readVerificationCode(state.code, action.entered);
      return { ...state, code: entry.code, lastEntry: entry };
    }
    case "clear":
      // The wait is about the text, not the field: a refused code does not
      // reset it.
      return { ...EMPTY_CODE_FIELD, sentAt: state.sentAt };
    case "sent":
      return { ...EMPTY_CODE_FIELD, sentAt: action.at };
    case "resent":
      return { ...EMPTY_CODE_FIELD, resent: true, sentAt: action.at };
  }
}

/**
 * Works out what the field draws.
 *
 * @param state - The field.
 * @param currentTime - The time to count the resend wait to (ms since the epoch).
 * @returns The code, whether it is whole, the line under it, and the
 *   seconds before the code can be sent again.
 */
export function readCodeField(state: CodeFieldState, currentTime: number): CodeFieldView {
  const waited = state.sentAt === null ? Infinity : (currentTime - state.sentAt) / 1000;
  return {
    code: state.code,
    complete: isCompleteVerificationCode(state.code),
    hint: state.resent ? VERIFICATION_CODE_RESENT : VERIFICATION_CODE_HINT,
    resendIn: Math.max(0, Math.ceil(CODE_RESEND_DELAY_SECONDS - waited)),
  };
}

/**
 * Labels the button that texts the code again, with the wait while there
 * is one.
 *
 * @param resendIn - Seconds before the code can be sent again.
 * @returns The label.
 */
export function resendCodeLabel(resendIn: number): string {
  return resendIn > 0 ? `${VERIFICATION_CODE_RESEND} in ${resendIn}s` : VERIFICATION_CODE_RESEND;
}

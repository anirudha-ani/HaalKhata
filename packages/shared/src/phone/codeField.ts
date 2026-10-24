/** The SMS code field as plain state and transitions, so the web and the mobile app hold one field and only draw it differently. */

import { VERIFICATION_CODE_HINT, VERIFICATION_CODE_RESENT } from "./phone.constants";
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
}

/** One thing that happens to the field. */
export type CodeFieldAction =
  /** A change, with the field's whole text after it, unread. */
  | { type: "enter"; entered: string }
  /** Emptied: a code was sent, a code was refused, or the step was left. */
  | { type: "clear" }
  /** Emptied after the code was sent again, and saying so. */
  | { type: "resent" };

/** Everything the field draws that is worked out from its state. */
export interface CodeFieldView {
  /** Digits in the field. */
  code: string;
  /** True once the field holds a whole code, the only thing worth sending. */
  complete: boolean;
  /** The line under the field: which code to enter, or that it was sent again. */
  hint: string;
}

/** The reading of a field nothing has been entered in. */
const NO_ENTRY: CodeEntry = { code: "", notice: "", arrivedWhole: false };

/** An empty field, before anything was sent again. */
export const EMPTY_CODE_FIELD: CodeFieldState = { code: "", lastEntry: NO_ENTRY, resent: false };

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
      return EMPTY_CODE_FIELD;
    case "resent":
      return { ...EMPTY_CODE_FIELD, resent: true };
  }
}

/**
 * Works out what the field draws.
 *
 * @param state - The field.
 * @returns The code, whether it is whole, and the line under it.
 */
export function readCodeField(state: CodeFieldState): CodeFieldView {
  return {
    code: state.code,
    complete: isCompleteVerificationCode(state.code),
    hint: state.resent ? VERIFICATION_CODE_RESENT : VERIFICATION_CODE_HINT,
  };
}

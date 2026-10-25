/** Unit tests for the SMS code field's state and transitions. */

import { describe, expect, it } from "vitest";
import {
  EMPTY_CODE_FIELD,
  codeFieldReducer,
  readCodeField,
  resendCodeLabel,
  type CodeFieldAction,
  type CodeFieldState,
} from "./codeField";
import {
  CODE_RESEND_DELAY_SECONDS,
  VERIFICATION_CODE_HINT,
  VERIFICATION_CODE_RESENT,
} from "./phone.constants";
import { codeLengthMessage } from "./verificationCode";

/**
 * Applies a run of actions to a field.
 *
 * @param actions - What happens, in order.
 * @returns Where the field ends up, starting empty.
 */
function after(...actions: CodeFieldAction[]): CodeFieldState {
  return actions.reduce(codeFieldReducer, EMPTY_CODE_FIELD);
}

/** A moment to count from, in ms since the epoch. */
const SENT_AT = 1_790_000_000_000;

describe("codeFieldReducer", () => {
  it("reads typed digits and keeps the reading", () => {
    const field = after({ type: "enter", entered: "4" }, { type: "enter", entered: "48" });

    expect(field.code).toBe("48");
    expect(field.lastEntry).toEqual({ code: "48", notice: "", arrivedWhole: false });
  });

  it("reads two quick changes in order", () => {
    // The second insertion of the same suggestion is read against the first.
    const field = after(
      { type: "enter", entered: "48291375" },
      { type: "enter", entered: "4829137548291375" },
    );

    expect(field.code).toBe("48291375");
    expect(field.lastEntry.arrivedWhole).toBe(false);
  });

  it("keeps a code of another length out, with its notice", () => {
    const field = after({ type: "enter", entered: "482913" });

    expect(field.code).toBe("");
    expect(field.lastEntry.notice).toBe(codeLengthMessage(6));
  });

  it("empties the field and forgets a resend when cleared, keeping the wait", () => {
    const field = after(
      { type: "enter", entered: "1234" },
      { type: "resent", at: SENT_AT },
      { type: "clear" },
    );

    expect(field).toEqual({ ...EMPTY_CODE_FIELD, sentAt: SENT_AT });
  });

  it("empties the field and starts the wait when a code is sent", () => {
    const field = after({ type: "enter", entered: "1234" }, { type: "sent", at: SENT_AT });

    expect(field).toEqual({ ...EMPTY_CODE_FIELD, sentAt: SENT_AT });
  });

  it("empties the field, says so and starts the wait again after a resend", () => {
    const field = after(
      { type: "sent", at: SENT_AT },
      { type: "enter", entered: "1234" },
      { type: "resent", at: SENT_AT + 40_000 },
    );

    expect(field.code).toBe("");
    expect(field.resent).toBe(true);
    expect(field.sentAt).toBe(SENT_AT + 40_000);
  });
});

describe("readCodeField", () => {
  it("is whole only at a code's length", () => {
    expect(readCodeField(after({ type: "enter", entered: "4829137" }), SENT_AT).complete).toBe(false);
    expect(readCodeField(after({ type: "enter", entered: "48291375" }), SENT_AT).complete).toBe(true);
  });

  it("asks for the latest text's code, until the code was sent again", () => {
    expect(readCodeField(EMPTY_CODE_FIELD, SENT_AT).hint).toBe(VERIFICATION_CODE_HINT);
    expect(readCodeField(after({ type: "resent", at: SENT_AT }), SENT_AT).hint).toBe(
      VERIFICATION_CODE_RESENT,
    );
  });

  it("counts down the wait after a send, whole seconds rounded up", () => {
    const field = after({ type: "sent", at: SENT_AT });

    expect(readCodeField(field, SENT_AT).resendIn).toBe(CODE_RESEND_DELAY_SECONDS);
    expect(readCodeField(field, SENT_AT + 100).resendIn).toBe(CODE_RESEND_DELAY_SECONDS);
    expect(readCodeField(field, SENT_AT + 29_500).resendIn).toBe(1);
    expect(readCodeField(field, SENT_AT + CODE_RESEND_DELAY_SECONDS * 1000).resendIn).toBe(0);
  });

  it("has no wait before any send", () => {
    expect(readCodeField(EMPTY_CODE_FIELD, SENT_AT).resendIn).toBe(0);
  });
});

describe("resendCodeLabel", () => {
  it("names the wait while there is one", () => {
    expect(resendCodeLabel(12)).toBe("Send the code again in 12s");
    expect(resendCodeLabel(0)).toBe("Send the code again");
  });
});

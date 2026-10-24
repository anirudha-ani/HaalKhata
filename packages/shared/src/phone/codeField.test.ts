/** Unit tests for the SMS code field's state and transitions. */

import { describe, expect, it } from "vitest";
import {
  EMPTY_CODE_FIELD,
  codeFieldReducer,
  readCodeField,
  type CodeFieldAction,
  type CodeFieldState,
} from "./codeField";
import { VERIFICATION_CODE_HINT, VERIFICATION_CODE_RESENT } from "./phone.constants";
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

  it("empties the field and forgets a resend when cleared", () => {
    const field = after({ type: "enter", entered: "1234" }, { type: "resent" }, { type: "clear" });

    expect(field).toEqual(EMPTY_CODE_FIELD);
  });

  it("empties the field and says so after a resend", () => {
    const field = after({ type: "enter", entered: "1234" }, { type: "resent" });

    expect(field.code).toBe("");
    expect(field.resent).toBe(true);
  });
});

describe("readCodeField", () => {
  it("is whole only at a code's length", () => {
    expect(readCodeField(after({ type: "enter", entered: "4829137" })).complete).toBe(false);
    expect(readCodeField(after({ type: "enter", entered: "48291375" })).complete).toBe(true);
  });

  it("asks for the latest text's code, until the code was sent again", () => {
    expect(readCodeField(EMPTY_CODE_FIELD).hint).toBe(VERIFICATION_CODE_HINT);
    expect(readCodeField(after({ type: "resent" })).hint).toBe(VERIFICATION_CODE_RESENT);
  });
});

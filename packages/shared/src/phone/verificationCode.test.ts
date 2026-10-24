/** Unit tests for reading the SMS verification code field. */

import { describe, expect, it } from "vitest";
import { VERIFICATION_CODE_LENGTH } from "./phone.constants";
import {
  codeLengthMessage,
  isCompleteVerificationCode,
  readVerificationCode,
} from "./verificationCode";

describe("readVerificationCode", () => {
  it("keeps typed digits one at a time", () => {
    expect(readVerificationCode("123", "1234")).toEqual({ code: "1234", notice: "", arrivedWhole: false });
  });

  it("drops anything that is not a digit", () => {
    expect(readVerificationCode("12", "12 3")).toEqual({ code: "123", notice: "", arrivedWhole: false });
  });

  it("stops typing at a whole code", () => {
    expect(readVerificationCode("12345678", "123456789")).toEqual({
      code: "12345678",
      notice: "",
      arrivedWhole: false,
    });
  });

  it("takes a suggested code into an empty field", () => {
    expect(readVerificationCode("", "48291375")).toEqual({ code: "48291375", notice: "", arrivedWhole: true });
  });

  it("reads the code out of a pasted message", () => {
    expect(readVerificationCode("", "Your HaalKhata code is: 48291375")).toEqual({
      code: "48291375",
      notice: "",
      arrivedWhole: true,
    });
  });

  it("replaces leftover digits with a suggestion tapped after them", () => {
    // Joined and cut to fit, this would be 12348291: a code nobody texted.
    expect(readVerificationCode("1234", "123448291375")).toEqual({
      code: "48291375",
      notice: "",
      arrivedWhole: true,
    });
  });

  it("replaces leftover digits with a suggestion landing before them", () => {
    expect(readVerificationCode("1234", "482913751234")).toEqual({
      code: "48291375",
      notice: "",
      arrivedWhole: true,
    });
  });

  it("keeps a suggestion that arrives twice once", () => {
    expect(readVerificationCode("48291375", "4829137548291375")).toEqual({
      code: "48291375",
      notice: "",
      arrivedWhole: true,
    });
  });

  it("says when a suggested code is too short to be ours", () => {
    // A six-digit code offered before ours arrived, such as Google's.
    expect(readVerificationCode("", "G-482913")).toEqual({
      code: "482913",
      notice: codeLengthMessage(6),
      arrivedWhole: false,
    });
  });

  it("clears the notice on the next keystroke", () => {
    expect(readVerificationCode("482913", "4829137")).toEqual({ code: "4829137", notice: "", arrivedWhole: false });
  });

  it("treats a replacement of the whole field as the new code", () => {
    expect(readVerificationCode("1234", "48291375")).toEqual({ code: "48291375", notice: "", arrivedWhole: true });
  });

  it("keeps the whole code when a suggestion replaces the digits typed so far", () => {
    // "4829" typed, then the suggestion tapped and filling the field: the
    // typed digits were the start of the same code, not something to strip.
    expect(readVerificationCode("4829", "48291375")).toEqual({ code: "48291375", notice: "", arrivedWhole: true });
  });
});

describe("isCompleteVerificationCode", () => {
  it("accepts exactly a code's length of digits", () => {
    expect(isCompleteVerificationCode("4".repeat(VERIFICATION_CODE_LENGTH))).toBe(true);
  });

  it("refuses shorter, longer and non-digit codes", () => {
    expect(isCompleteVerificationCode("482913")).toBe(false);
    expect(isCompleteVerificationCode("4829137512")).toBe(false);
    expect(isCompleteVerificationCode("4829137a")).toBe(false);
    expect(isCompleteVerificationCode("")).toBe(false);
  });
});

describe("codeLengthMessage", () => {
  it("names both lengths", () => {
    expect(codeLengthMessage(6)).toBe(
      "that code has 6 digits and ours have 8, use the code in our latest text",
    );
  });

  it("says digit for one", () => {
    expect(codeLengthMessage(1)).toContain("has 1 digit and");
  });
});

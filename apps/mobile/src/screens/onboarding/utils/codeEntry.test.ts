/** Tests for reading the verification code field. */

import { describe, expect, it } from "vitest";
import { arrivedWhole, canSubmitCode, codeDigits } from "./codeEntry";

describe("codeDigits", () => {
  it("keeps only digits, up to ten", () => {
    expect(codeDigits("Your code is 123-456")).toBe("123456");
    expect(codeDigits("12345678901234")).toBe("1234567890");
    expect(codeDigits("abc")).toBe("");
  });
});

describe("arrivedWhole", () => {
  it("recognizes AutoFill and paste", () => {
    expect(arrivedWhole("", "123456")).toBe(true);
    expect(arrivedWhole("1", "123456")).toBe(true);
  });

  it("waits for Verify while digits are typed", () => {
    expect(arrivedWhole("12345", "123456")).toBe(false);
    expect(arrivedWhole("", "123")).toBe(false);
  });
});

describe("canSubmitCode", () => {
  it("needs at least four digits", () => {
    expect(canSubmitCode("123")).toBe(false);
    expect(canSubmitCode("1234")).toBe(true);
  });
});

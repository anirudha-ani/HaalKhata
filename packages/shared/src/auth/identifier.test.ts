/** Unit tests for the email-or-phone identifier router. */

import { describe, expect, it } from "vitest";
import { splitIdentifier } from "./identifier";

describe("splitIdentifier", () => {
  it("routes anything containing @ to the email field", () => {
    expect(splitIdentifier("someone@example.com")).toEqual({
      email: "someone@example.com",
      phone: "",
    });
  });

  it("keeps plus-addressing intact", () => {
    expect(splitIdentifier("someone+tag@example.com").email).toBe("someone+tag@example.com");
  });

  it("routes anything else to the phone field", () => {
    expect(splitIdentifier("+14155552671")).toEqual({
      email: "",
      phone: "+14155552671",
    });
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(splitIdentifier("  someone@example.com  ").email).toBe("someone@example.com");
    expect(splitIdentifier("  617-555-1212  ").phone).toBe("617-555-1212");
  });

  it("treats an empty string as an empty phone, leaving both validators to reject it", () => {
    expect(splitIdentifier("   ")).toEqual({ email: "", phone: "" });
  });
});

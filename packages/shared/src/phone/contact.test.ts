/** Unit tests for the shared email-or-phone contact draft. */

import { describe, expect, it } from "vitest";
import { contactIsEmpty, contactPayload, EMPTY_CONTACT } from "./contact";

describe("contactPayload", () => {
  it("returns an empty pair for an untouched draft", () => {
    expect(contactIsEmpty(EMPTY_CONTACT)).toBe(true);
    expect(contactPayload(EMPTY_CONTACT)).toEqual({ email: "", phone: "" });
  });

  it("trims and passes an email through without second-guessing it", () => {
    const draft = { ...EMPTY_CONTACT, email: "  tanvir@example.com " };
    expect(contactPayload(draft)).toEqual({ email: "tanvir@example.com", phone: "" });
  });

  it("composes a valid phone draft into E.164", () => {
    const draft = {
      ...EMPTY_CONTACT,
      mode: "phone" as const,
      region: "US",
      nationalNumber: "(617) 555-0123",
    };
    expect(contactPayload(draft)).toEqual({ email: "", phone: "+16175550123" });
  });

  it("returns null for digits that are not a number in that country", () => {
    const draft = { ...EMPTY_CONTACT, mode: "phone" as const, nationalNumber: "12345" };
    expect(contactPayload(draft)).toBeNull();
  });

  it("ignores the inactive side when judging emptiness", () => {
    // A half-typed email must not block a submission made in phone mode.
    const draft = {
      mode: "phone" as const,
      email: "abandoned@",
      region: "US",
      nationalNumber: "",
    };
    expect(contactIsEmpty(draft)).toBe(true);
    expect(contactPayload(draft)).toEqual({ email: "", phone: "" });
  });
});

/** Unit tests for the payment-method validator shared by both apps and the server. */

import { describe, expect, test } from "vitest";
import { checkPaymentMethod, firstPaymentMethodError } from "./validateMethod";
import type { PaymentMethodFields } from "./types";

/**
 * Builds a draft with sensible defaults so each test states only what it is about.
 *
 * @param overrides - Fields to replace on the default bKash draft.
 * @returns A complete draft.
 */
function draftWith(overrides: Partial<PaymentMethodFields>): PaymentMethodFields {
  return {
    name: "bKash",
    currency: "BDT",
    preset: "",
    details: [{ kind: "phone", label: "", value: "+8801712345678" }],
    note: "",
    ...overrides,
  };
}

describe("checkPaymentMethod", () => {
  test("accepts a wallet reached by phone and stores the number in E.164", () => {
    const check = checkPaymentMethod(
      draftWith({ details: [{ kind: "phone", label: "", value: "+880 1712-345678" }] }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.details).toEqual([{ kind: "phone", label: "", value: "+8801712345678" }]);
  });

  test("trims the name, upper-cases the currency and keeps an empty currency as any", () => {
    const check = checkPaymentMethod(draftWith({ name: "  bKash ", currency: " bdt " }));
    expect(check.valid).toBe(true);
    expect(check.method.name).toBe("bKash");
    expect(check.method.currency).toBe("BDT");
    expect(checkPaymentMethod(draftWith({ currency: "" })).method.currency).toBe("");
  });

  test("refuses a blank name, a long name and a currency outside the catalog", () => {
    expect(checkPaymentMethod(draftWith({ name: "   " })).errors.name).toBeDefined();
    expect(checkPaymentMethod(draftWith({ name: "x".repeat(41) })).errors.name).toBeDefined();
    expect(checkPaymentMethod(draftWith({ name: "x".repeat(40) })).valid).toBe(true);
    expect(checkPaymentMethod(draftWith({ currency: "ZZZ" })).errors.currency).toBeDefined();
  });

  test("a phone without a country code is refused, since the payer may be abroad", () => {
    const check = checkPaymentMethod(
      draftWith({ details: [{ kind: "phone", label: "", value: "01712345678" }] }),
    );
    expect(check.valid).toBe(false);
    expect(check.errors.detailRows[0]).toContain("country code");
  });

  test("drops blank rows, so a bank form can be saved partly filled", () => {
    const check = checkPaymentMethod(
      draftWith({
        name: "Chase checking",
        currency: "USD",
        details: [
          { kind: "account_name", label: "", value: "Jordan Lee" },
          { kind: "bank_name", label: "", value: "   " },
          { kind: "account_type", label: "", value: "checking" },
          { kind: "account_number", label: "", value: " 000123454821 " },
          { kind: "routing_number", label: "", value: "" },
          { kind: "swift", label: "", value: "" },
        ],
      }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.details.map((detail) => detail.kind)).toEqual([
      "account_name",
      "account_type",
      "account_number",
    ]);
    expect(check.method.details[2]?.value).toBe("000123454821");
  });

  test("keys a row's error by its place in the draft, not after dropping blanks", () => {
    const check = checkPaymentMethod(
      draftWith({
        details: [
          { kind: "account_name", label: "", value: "" },
          { kind: "email", label: "", value: "not-an-email" },
        ],
      }),
    );
    expect(check.errors.detailRows).toEqual({ 1: "enter a valid email address" });
  });

  test("needs at least one detail and takes at most eight", () => {
    expect(checkPaymentMethod(draftWith({ details: [] })).errors.details).toBeDefined();
    const nine = Array.from({ length: 9 }, (_unused, index) => ({
      kind: "custom",
      label: `Field ${index}`,
      value: "value",
    }));
    expect(checkPaymentMethod(draftWith({ details: nine })).errors.details).toContain("at most 8");
    expect(checkPaymentMethod(draftWith({ details: nine.slice(0, 8) })).valid).toBe(true);
  });

  test("a custom detail needs a label, and only a custom detail keeps one", () => {
    const unlabelled = checkPaymentMethod(
      draftWith({ details: [{ kind: "custom", label: " ", value: "HDFC0001234" }] }),
    );
    expect(unlabelled.errors.detailRows[0]).toBe("give this detail a label");

    const labelled = checkPaymentMethod(
      draftWith({
        details: [
          { kind: "custom", label: " IFSC ", value: "HDFC0001234" },
          { kind: "username", label: "ignored", value: "jordan@upi" },
        ],
      }),
    );
    expect(labelled.valid).toBe(true);
    expect(labelled.method.details).toEqual([
      { kind: "custom", label: "IFSC", value: "HDFC0001234" },
      { kind: "username", label: "", value: "jordan@upi" },
    ]);
  });

  test("refuses a custom label that names a secret", () => {
    for (const label of ["PIN", "Card CVV", "online banking password", "OTP"]) {
      const check = checkPaymentMethod(
        draftWith({ details: [{ kind: "custom", label, value: "1234" }] }),
      );
      expect(check.errors.detailRows[0]).toContain("never share");
    }
    // "Pincode" is a postal code in India, not a secret.
    expect(
      checkPaymentMethod(draftWith({ details: [{ kind: "custom", label: "Pincode", value: "560001" }] }))
        .valid,
    ).toBe(true);
  });

  test("stores SWIFT and IBAN compact and in capitals", () => {
    const check = checkPaymentMethod(
      draftWith({
        details: [
          { kind: "swift", label: "", value: "abcd us 33" },
          { kind: "iban", label: "", value: "gb82 west 1234 5698 7654 32" },
        ],
      }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.details.map((detail) => detail.value)).toEqual([
      "ABCDUS33",
      "GB82WEST12345698765432",
    ]);
    expect(
      checkPaymentMethod(draftWith({ details: [{ kind: "swift", label: "", value: "ABC" }] })).valid,
    ).toBe(false);
    expect(
      checkPaymentMethod(draftWith({ details: [{ kind: "iban", label: "", value: "GB82" }] })).valid,
    ).toBe(false);
  });

  test("an account type is one of the offered choices", () => {
    expect(
      checkPaymentMethod(draftWith({ details: [{ kind: "account_type", label: "", value: "current" }] }))
        .valid,
    ).toBe(true);
    expect(
      checkPaymentMethod(draftWith({ details: [{ kind: "account_type", label: "", value: "offshore" }] }))
        .valid,
    ).toBe(false);
  });

  test("a link must be https with a plain host and nothing in front of it", () => {
    const linkCheck = (value: string) =>
      checkPaymentMethod(draftWith({ details: [{ kind: "link", label: "", value }] })).valid;
    expect(linkCheck("https://wise.com/pay/me/jordanl")).toBe(true);
    expect(linkCheck("https://pay.example.co.uk:8443/x?amount=5#top")).toBe(true);
    expect(linkCheck("http://wise.com/pay/me/jordanl")).toBe(false);
    expect(linkCheck("javascript:alert(1)")).toBe(false);
    expect(linkCheck("wise.com/pay/me/jordanl")).toBe(false);
    // Each of these displays one site and can open another.
    expect(linkCheck("https://paypal.com@evil.example/pay")).toBe(false);
    expect(linkCheck("https://evil.example\\.paypal.com/pay")).toBe(false);
    expect(linkCheck("https://раураl.com/pay")).toBe(false);
    expect(linkCheck("https://wise.com/pay me")).toBe(false);
  });

  test("holds values to their cap, with a longer one for a link", () => {
    expect(
      checkPaymentMethod(
        draftWith({ details: [{ kind: "username", label: "", value: "x".repeat(121) }] }),
      ).valid,
    ).toBe(false);
    const longLink = `https://example.com/${"x".repeat(200)}`;
    expect(
      checkPaymentMethod(draftWith({ details: [{ kind: "link", label: "", value: longLink }] })).valid,
    ).toBe(true);
    expect(
      checkPaymentMethod(
        draftWith({ details: [{ kind: "link", label: "", value: `${longLink}${"x".repeat(100)}` }] }),
      ).valid,
    ).toBe(false);
  });

  test("refuses line breaks in the name, a value and the note", () => {
    expect(checkPaymentMethod(draftWith({ name: "bKash\nfree money" })).errors.name).toBeDefined();
    expect(checkPaymentMethod(draftWith({ note: "line one\nline two" })).errors.note).toBeDefined();
    expect(
      checkPaymentMethod(
        draftWith({ details: [{ kind: "username", label: "", value: "jordan\tlee" }] }),
      ).errors.detailRows[0],
    ).toBeDefined();
  });

  test("caps the note at 200 characters", () => {
    expect(checkPaymentMethod(draftWith({ note: "x".repeat(200) })).valid).toBe(true);
    expect(checkPaymentMethod(draftWith({ note: "x".repeat(201) })).errors.note).toBeDefined();
  });

  test("refuses an unknown kind and an unknown preset", () => {
    expect(
      checkPaymentMethod(draftWith({ details: [{ kind: "card_number", label: "", value: "4111" }] }))
        .errors.detailRows[0],
    ).toContain("unknown kind");
    expect(checkPaymentMethod(draftWith({ preset: "carrier-pigeon" })).errors.preset).toBeDefined();
  });
});

describe("checkPaymentMethod with a built-in app", () => {
  test("stores a Venmo username without the sigil it was pasted with", () => {
    const check = checkPaymentMethod(
      draftWith({
        name: "Venmo",
        currency: "USD",
        preset: "venmo",
        details: [{ kind: "username", label: "", value: " @jordan-lee " }],
      }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.details[0]?.value).toBe("jordan-lee");
  });

  test("Zelle takes an email or a phone, and nothing else", () => {
    const zelle = (kind: string, value: string) =>
      checkPaymentMethod(
        draftWith({ name: "Zelle", currency: "USD", preset: "zelle", details: [{ kind, label: "", value }] }),
      );
    expect(zelle("email", "jordan@example.com").valid).toBe(true);
    expect(zelle("phone", "+14155552671").valid).toBe(true);
    expect(zelle("username", "jordan").errors.detailRows[0]).toContain("Zelle does not take");
  });

  test("takes a single detail, since its link is built from one identifier", () => {
    const check = checkPaymentMethod(
      draftWith({
        name: "PayPal",
        currency: "",
        preset: "paypal",
        details: [
          { kind: "username", label: "", value: "https://paypal.me/jordanlee" },
          { kind: "username", label: "", value: "second" },
        ],
      }),
    );
    expect(check.errors.details).toBe("PayPal takes a single detail");
    expect(check.method.details[0]?.value).toBe("jordanlee");
  });
});

describe("firstPaymentMethodError", () => {
  test("reads in form order: name, currency, details, rows, note", () => {
    const check = checkPaymentMethod(
      draftWith({
        name: "",
        note: "x".repeat(201),
        details: [
          { kind: "email", label: "", value: "fine@example.com" },
          { kind: "email", label: "", value: "broken" },
        ],
      }),
    );
    expect(firstPaymentMethodError(check.errors)).toBe("give this method a name");
    expect(firstPaymentMethodError({ ...check.errors, name: undefined })).toBe(
      "enter a valid email address",
    );
    expect(firstPaymentMethodError({ detailRows: {}, note: "too long" })).toBe("too long");
    expect(firstPaymentMethodError({ detailRows: {} })).toBe("");
  });
});

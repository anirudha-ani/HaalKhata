/** Unit tests for the payment-method validator shared by both apps and the server. */

import { describe, expect, test } from "vitest";
import { checkPaymentMethod, firstPaymentMethodError } from "./validateMethod";
import { SECRET_REFUSAL } from "./payment.constants";
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

  test("a hidden mark or a lookalike letter does not get a secret past the name", () => {
    for (const name of ["P\uFE0FIN", "P\u034FIN", "ΡΙΝ", "P1N"]) {
      expect(checkPaymentMethod(draftWith({ name })).errors.name).toBe(SECRET_REFUSAL);
    }
  });

  test("a name made only of hidden marks counts as no name", () => {
    expect(checkPaymentMethod(draftWith({ name: "\uFE0F\u034F\u17B4" })).errors.name).toBe("give this method a name");
  });

  test("a name with an emoji in it is fine, and keeps it", () => {
    const { method } = checkPaymentMethod(draftWith({ name: "bKash \u2764\uFE0F" }));
    expect(method.name).toBe("bKash \u2764\uFE0F");
  });

  test("a PayPal.Me name is letters and numbers, so it cannot point a link somewhere else", () => {
    const paypal = (value: string) =>
      checkPaymentMethod(draftWith({ name: "PayPal", preset: "paypal", currency: "USD", details: [{ kind: "username", label: "", value }] }));
    expect(paypal("jordanlee").valid).toBe(true);
    expect(paypal("..").errors.detailRows[0]).toContain("letters and numbers");
    expect(paypal("...").valid).toBe(false);
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

describe("checkPaymentMethod on input sized to hurt", () => {
  /**
   * Runs a check and reports how long it took.
   *
   * @param draft - The draft to check.
   * @returns The check and the milliseconds it took.
   */
  function timed(draft: PaymentMethodFields) {
    const started = performance.now();
    const check = checkPaymentMethod(draft);
    return { check, tookMs: performance.now() - started };
  }

  // The slash-trimming pattern this replaces took 1.7 s on 80,000 slashes
  // and four times as long for each doubling, so 300,000 would be near half
  // a minute. A second is a generous bound for work that no longer scales.
  test("a megabyte-scale run of slashes in a PayPal handle is refused at once", () => {
    const { check, tookMs } = timed(
      draftWith({
        name: "PayPal",
        currency: "",
        preset: "paypal",
        details: [{ kind: "username", label: "", value: `${"/".repeat(300_000)}x` }],
      }),
    );
    expect(check.valid).toBe(false);
    expect(check.errors.detailRows[0]).toBe("keep this under 120 characters");
    expect(tookMs).toBeLessThan(1000);
  });

  test("a hundred thousand rows are refused without being read", () => {
    const { check, tookMs } = timed(
      draftWith({
        details: Array.from({ length: 100_000 }, () => ({
          kind: "phone",
          label: "",
          value: "+8801712345678",
        })),
      }),
    );
    expect(check.valid).toBe(false);
    expect(check.errors.details).toBe("a method can have at most 8 details");
    expect(check.errors.detailRows).toEqual({});
    expect(check.method.details).toEqual([]);
    expect(tookMs).toBeLessThan(200);
  });

  test("every other field is measured before it is read", () => {
    const huge = "x".repeat(500_000);
    const { check, tookMs } = timed(
      draftWith({
        name: huge,
        currency: huge,
        preset: huge,
        note: huge,
        details: [{ kind: "custom", label: huge, value: huge }],
      }),
    );
    expect(check.valid).toBe(false);
    expect(check.errors.name).toBe("keep the name under 40 characters");
    expect(check.errors.currency).toBe("choose a currency from the list");
    expect(check.errors.preset).toBe("unknown payment app");
    expect(check.errors.note).toBe("keep the note under 200 characters");
    expect(check.errors.detailRows[0]).toBe("keep this under 120 characters");
    expect(tookMs).toBeLessThan(200);
  });

  test("an error repeats back only the start of what was refused", () => {
    const check = checkPaymentMethod(
      draftWith({
        currency: "Q".repeat(200),
        preset: "p".repeat(200),
        details: [{ kind: "k".repeat(200), label: "", value: "abc" }],
      }),
    );
    for (const message of [
      check.errors.currency,
      check.errors.preset,
      check.errors.detailRows[0],
    ]) {
      expect(message).toBeDefined();
      expect(message!.length).toBeLessThan(80);
    }
  });

  test("padding around a paste is still trimmed, not counted", () => {
    const check = checkPaymentMethod(draftWith({ name: `${" ".repeat(300)}bKash${" ".repeat(300)}` }));
    expect(check.valid).toBe(true);
    expect(check.method.name).toBe("bKash");
  });

  test("blank rows beyond the eight a method keeps are dropped, not refused", () => {
    const blank = { kind: "custom", label: "", value: "  " };
    const check = checkPaymentMethod(
      draftWith({
        details: [...Array.from({ length: 20 }, () => blank), { kind: "phone", label: "", value: "+8801712345678" }],
      }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.details).toHaveLength(1);
  });
});

describe("checkPaymentMethod and characters nobody can see", () => {
  test("an account number is stored as the digits a payer reads", () => {
    const check = checkPaymentMethod(
      draftWith({
        details: [
          { kind: "account_number", label: "", value: "123\u202E456789" },
          { kind: "routing_number", label: "", value: "0210\u200B00021" },
          { kind: "username", label: "", value: "\uFEFFjordan\u00ADlee" },
        ],
      }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.details.map((detail) => detail.value)).toEqual([
      "123456789",
      "021000021",
      "jordanlee",
    ]);
  });

  test("a name, note or label made only of hidden characters is blank", () => {
    expect(checkPaymentMethod(draftWith({ name: "\u200B\u200B" })).errors.name).toBe(
      "give this method a name",
    );
    expect(checkPaymentMethod(draftWith({ name: "\u200D\u3164" })).errors.name).toBe(
      "give this method a name",
    );
    expect(
      checkPaymentMethod(
        draftWith({ details: [{ kind: "custom", label: "\u2060", value: "ABCD0001234" }] }),
      ).errors.detailRows[0],
    ).toBe("give this detail a label");
    expect(checkPaymentMethod(draftWith({ note: "\u200B" })).method.note).toBe("");
  });

  test("a value made only of hidden characters is a blank row, and blank rows are dropped", () => {
    const check = checkPaymentMethod(
      draftWith({ details: [{ kind: "account_number", label: "", value: "\u200B\u202E" }] }),
    );
    expect(check.errors.details).toBe("add at least one detail a payer can use");
  });

  test("direction marks are taken out of a name instead of reordering what follows it", () => {
    const check = checkPaymentMethod(
      draftWith({ name: "Zelle \u202Eknab", note: "send \u2066here\u2069 only" }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.name).toBe("Zelle knab");
    expect(check.method.note).toBe("send here only");
  });

  test("a name in Bengali keeps the joiner its letters need", () => {
    const name = "\u09B0\u200D\u09CD\u09AF\u09BE\u09AC";
    const check = checkPaymentMethod(
      draftWith({ name, details: [{ kind: "account_name", label: "", value: name }] }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.name).toBe(name);
    expect(check.method.details[0]!.value).toBe(name);
  });

  test("a line or paragraph separator is a line break like any other", () => {
    expect(checkPaymentMethod(draftWith({ name: "Chase\u2028checking" })).errors.name).toBe(
      "remove the line break",
    );
    expect(checkPaymentMethod(draftWith({ note: "one\u2029two" })).errors.note).toBe(
      "keep the note to one line",
    );
    expect(
      checkPaymentMethod(
        draftWith({ details: [{ kind: "custom", label: "Branch", value: "Gulshan\u2028Account: 9" }] }),
      ).errors.detailRows[0],
    ).toBe("remove the line break");
  });

  test("a link keeps its host and loses what hides in its path", () => {
    const check = checkPaymentMethod(
      draftWith({ details: [{ kind: "link", label: "", value: "https://pay.example/\u202Egnp.moc" }] }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.details[0]!.value).toBe("https://pay.example/gnp.moc");
  });

  test("a built-in app's handle is cleaned before its sigil is stripped", () => {
    const check = checkPaymentMethod(
      draftWith({
        name: "Venmo",
        currency: "USD",
        preset: "venmo",
        details: [{ kind: "username", label: "", value: "\u200B@jordan-lee\u200B" }],
      }),
    );
    expect(check.valid).toBe(true);
    expect(check.method.details[0]!.value).toBe("jordan-lee");
  });
});

describe("checkPaymentMethod and what a value may look like", () => {
  test("a method's name may not ask for a secret either", () => {
    expect(checkPaymentMethod(draftWith({ name: "Chase PIN 4821" })).errors.name).toContain(
      "never share",
    );
    expect(checkPaymentMethod(draftWith({ name: "Debit card" })).errors.name).toContain(
      "never share",
    );
    expect(checkPaymentMethod(draftWith({ name: "Chase checking" })).valid).toBe(true);
  });

  test("labels that ask for a card or its code are refused however they are spelled", () => {
    for (const label of ["Security code", "Card number", "P I N", "CVV2", "\uFF30\uFF29\uFF2E"]) {
      const check = checkPaymentMethod(
        draftWith({ details: [{ kind: "custom", label, value: "4821" }] }),
      );
      expect(check.errors.detailRows[0]).toContain("never share");
    }
  });

  test("an account number is letters and digits with the usual separators", () => {
    const accept = ["000123456789", "19-2000145399/0800", "GB29 NWBK 6016", "12.345.678-9", "\u09E7\u09E8\u09E9\u09EA"];
    for (const value of accept) {
      expect(
        checkPaymentMethod(draftWith({ details: [{ kind: "account_number", label: "", value }] }))
          .valid,
      ).toBe(true);
    }
    const refuse = ["1' OR '1'='1", "abc", "<script>", "12=34", "-1234"];
    for (const value of refuse) {
      expect(
        checkPaymentMethod(draftWith({ details: [{ kind: "account_number", label: "", value }] }))
          .errors.detailRows[0],
      ).toContain("an account number is");
    }
  });

  test("a routing number needs a digit and takes no punctuation but spaces and dashes", () => {
    for (const value of ["021000021", "12-34-56", "00123 456", "HDFC0001234"]) {
      expect(
        checkPaymentMethod(draftWith({ details: [{ kind: "routing_number", label: "", value }] }))
          .valid,
      ).toBe(true);
    }
    for (const value of ["abc", "12/34", "1;2"]) {
      expect(
        checkPaymentMethod(draftWith({ details: [{ kind: "routing_number", label: "", value }] }))
          .errors.detailRows[0],
      ).toContain("a routing number is");
    }
  });

  /**
   * Checks a built-in app's method with one username.
   *
   * @param preset - venmo, cashapp or paypal.
   * @param value - The username as typed.
   * @returns The check.
   */
  function builtInWith(preset: string, value: string) {
    return checkPaymentMethod(
      draftWith({ name: "App", currency: "USD", preset, details: [{ kind: "username", label: "", value }] }),
    );
  }

  test("a built-in app's username has the shape the app issues", () => {
    expect(builtInWith("venmo", "jordan-lee_9").valid).toBe(true);
    expect(builtInWith("cashapp", "$jordanlee").method.details[0]!.value).toBe("jordanlee");
    expect(builtInWith("paypal", "jordanlee").valid).toBe(true);
    for (const value of ["jordan lee", "jordan/../evil?amount=999", "jordan&amount=1", "j".repeat(31)]) {
      expect(builtInWith("venmo", value).errors.detailRows[0]).toContain("a Venmo username is");
    }
    expect(builtInWith("cashapp", "jordan lee").errors.detailRows[0]).toContain("a $cashtag is");
    expect(builtInWith("paypal", "jordan lee").errors.detailRows[0]).toContain("a PayPal.Me name is");
  });

  test("a profile link pasted whole is unpicked to the username", () => {
    expect(builtInWith("venmo", "https://venmo.com/u/jordan-lee").method.details[0]!.value).toBe(
      "jordan-lee",
    );
    expect(builtInWith("venmo", "account.venmo.com/u/jordan-lee/").method.details[0]!.value).toBe(
      "jordan-lee",
    );
    expect(builtInWith("venmo", "@ jordan-lee").method.details[0]!.value).toBe("jordan-lee");
    expect(builtInWith("cashapp", "https://cash.app/$jordanlee").method.details[0]!.value).toBe(
      "jordanlee",
    );
    expect(builtInWith("paypal", "https://www.paypal.me/jordanlee/").method.details[0]!.value).toBe(
      "jordanlee",
    );
  });

  test("an over-long username is told its length, not its shape", () => {
    expect(builtInWith("venmo", "j".repeat(200)).errors.detailRows[0]).toBe(
      "keep this under 120 characters",
    );
  });

  test("a username outside a built-in app is not held to any app's shape", () => {
    expect(
      checkPaymentMethod(
        draftWith({ details: [{ kind: "username", label: "", value: "jordan@upi" }] }),
      ).valid,
    ).toBe(true);
  });
});

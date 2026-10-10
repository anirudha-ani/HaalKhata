/** Unit tests for how a payment method is summarised, copied and linked. */

import { describe, expect, test } from "vitest";
import {
  detailCopyText,
  linkHost,
  methodCopyText,
  methodCurrencyLabel,
  methodSummary,
  valueTail,
} from "./formatMethod";
import { detailLabel, detailValueText } from "./detailKinds";
import type { PaymentMethodFields } from "./types";

const BANK: PaymentMethodFields = {
  name: "Chase checking",
  currency: "USD",
  preset: "",
  details: [
    { kind: "account_name", label: "", value: "Jordan Lee" },
    { kind: "account_type", label: "", value: "checking" },
    { kind: "account_number", label: "", value: "0001 2345 4821" },
    { kind: "custom", label: "Branch", value: "Downtown" },
  ],
  note: "Reference: dinner",
};

describe("detail labels and values", () => {
  test("a custom detail shows its own label, every other kind the catalog's", () => {
    expect(detailLabel({ kind: "custom", label: "IFSC", value: "x" })).toBe("IFSC");
    expect(detailLabel({ kind: "swift", label: "ignored", value: "x" })).toBe("SWIFT / BIC");
    expect(detailLabel({ kind: "from_the_future", label: "", value: "x" })).toBe("from_the_future");
  });

  test("an account type reads as its name, not its key", () => {
    expect(detailValueText({ kind: "account_type", label: "", value: "savings" })).toBe("Savings");
    expect(detailValueText({ kind: "account_type", label: "", value: "unknown" })).toBe("unknown");
    expect(detailValueText({ kind: "username", label: "", value: "savings" })).toBe("savings");
  });
});

describe("methodSummary", () => {
  test("a bank method is recognised by its masked account number, not the holder's name", () => {
    expect(methodSummary(BANK)).toBe("Account ending 4821");
  });

  test("an IBAN is masked the same way", () => {
    expect(
      methodSummary({
        ...BANK,
        details: [{ kind: "iban", label: "", value: "GB82WEST12345698765432" }],
      }),
    ).toBe("IBAN ending 5432");
  });

  test("a wallet shows its phone, email or username as it is", () => {
    expect(
      methodSummary({ ...BANK, details: [{ kind: "phone", label: "", value: "+8801712345678" }] }),
    ).toBe("+8801712345678");
  });

  test("a built-in app shows the handle the way its profile prints it", () => {
    expect(
      methodSummary({
        ...BANK,
        preset: "venmo",
        details: [{ kind: "username", label: "", value: "jordan-lee" }],
      }),
    ).toBe("@jordan-lee");
    expect(
      methodSummary({
        ...BANK,
        preset: "zelle",
        details: [{ kind: "email", label: "", value: "jordan@example.com" }],
      }),
    ).toBe("jordan@example.com");
  });

  test("a link is summarised by its host", () => {
    expect(
      methodSummary({
        ...BANK,
        details: [{ kind: "link", label: "", value: "https://Wise.com/pay/me/jordanl" }],
      }),
    ).toBe("wise.com");
  });

  test("with nothing identifying, the first detail is shown with its label", () => {
    expect(
      methodSummary({ ...BANK, details: [{ kind: "custom", label: "Branch", value: "Downtown" }] }),
    ).toBe("Branch: Downtown");
    expect(methodSummary({ ...BANK, details: [] })).toBe("");
  });
});

describe("copy text", () => {
  test("one detail copies as its bare value", () => {
    expect(detailCopyText(BANK, BANK.details[2]!)).toBe("0001 2345 4821");
    expect(detailCopyText(BANK, BANK.details[1]!)).toBe("Checking");
  });

  test("a built-in app's username copies with its sigil", () => {
    expect(
      detailCopyText({ preset: "cashapp" }, { kind: "username", label: "", value: "jordanlee" }),
    ).toBe("$jordanlee");
  });

  test("copy all is the name, one labelled line per detail, and the note", () => {
    expect(methodCopyText(BANK)).toBe(
      [
        "Chase checking",
        "Account holder name: Jordan Lee",
        "Account type: Checking",
        "Account number: 0001 2345 4821",
        "Branch: Downtown",
        "Note: Reference: dinner",
      ].join("\n"),
    );
    expect(methodCopyText({ ...BANK, note: "  " })).not.toContain("Note:");
  });
});

describe("small helpers", () => {
  test("valueTail keeps the last four characters and ignores spaces", () => {
    expect(valueTail("0001 2345 48 21")).toBe("4821");
    expect(valueTail("21")).toBe("21");
  });

  test("linkHost returns nothing for a link that must not be offered", () => {
    expect(linkHost("https://paypal.me/jordanlee")).toBe("paypal.me");
    expect(linkHost("http://paypal.me/jordanlee")).toBe("");
    expect(linkHost("https://paypal.com@evil.example/")).toBe("");
  });

  test("an any-currency method says so where a code would be", () => {
    expect(methodCurrencyLabel({ currency: "BDT" })).toBe("BDT");
    expect(methodCurrencyLabel({ currency: "" })).toBe("Any");
  });
});

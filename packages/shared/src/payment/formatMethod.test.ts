/** Unit tests for how a payment method is summarised, copied and linked. */

import { describe, expect, test } from "vitest";
import {
  detailCopyText,
  keyedDetails,
  linkHost,
  methodCopyText,
  methodCurrencyLabel,
  methodCurrencyPhrase,
  methodSummary,
  recentChange,
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
    // The tag is one word; inside a sentence it has to read as a phrase.
    expect(methodCurrencyPhrase({ currency: "BDT" })).toBe("BDT");
    expect(methodCurrencyPhrase({ currency: "" })).toBe("any currency");
  });
});

describe("recentChange", () => {
  const nowMs = Date.parse("2026-10-10T12:00:00.000Z");
  const daysAgo = (days: number) => new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
  /**
   * Builds the stamps of a method edited some days after it was added.
   *
   * @param editedDaysAgo - How long ago it was last edited.
   * @returns The stamps, with the method added a year ago.
   */
  const edited = (editedDaysAgo: number) => ({
    createdAt: daysAgo(365),
    updatedAt: daysAgo(editedDaysAgo),
  });
  /**
   * Builds the stamps of a method that was added and never edited.
   *
   * @param addedDaysAgo - How long ago it was added.
   * @returns The stamps, equal to each other.
   */
  const untouched = (addedDaysAgo: number) => ({
    createdAt: daysAgo(addedDaysAgo),
    updatedAt: daysAgo(addedDaysAgo),
  });

  test("an edited method says how recently it changed, for two weeks", () => {
    expect(recentChange(edited(0), nowMs)).toEqual({ text: "Changed today", edited: true });
    expect(recentChange(edited(1), nowMs)).toEqual({ text: "Changed yesterday", edited: true });
    expect(recentChange(edited(2), nowMs)).toEqual({ text: "Changed 2 days ago", edited: true });
    expect(recentChange(edited(14), nowMs)?.text).toBe("Changed 14 days ago");
  });

  test("a method that was only ever added says so, without the alarm", () => {
    expect(recentChange(untouched(0), nowMs)).toEqual({ text: "Added today", edited: false });
    expect(recentChange(untouched(3), nowMs)).toEqual({ text: "Added 3 days ago", edited: false });
  });

  test("says nothing once the change is old, in the future, or unreadable", () => {
    expect(recentChange(edited(15), nowMs)).toBeUndefined();
    expect(recentChange(untouched(400), nowMs)).toBeUndefined();
    expect(recentChange(edited(-2), nowMs)).toBeUndefined();
    expect(recentChange({ createdAt: "", updatedAt: "" }, nowMs)).toBeUndefined();
    expect(recentChange({ createdAt: daysAgo(3), updatedAt: "not a date" }, nowMs)).toBeUndefined();
  });

  test("a method copied from an old handle is dated before today and says nothing", () => {
    // The backfill dates a method from its owner's account, and created_at
    // sits a few milliseconds after updated_at to keep the old order.
    const copied = { createdAt: "2026-07-04T12:00:00.002Z", updatedAt: "2026-07-04T12:00:00.000Z" };
    expect(recentChange(copied, nowMs)).toBeUndefined();
  });

  test("an unreadable creation stamp falls back to the louder wording", () => {
    expect(recentChange({ createdAt: "", updatedAt: daysAgo(1) }, nowMs)?.edited).toBe(true);
  });
});

describe("keyedDetails", () => {
  test("keys are unique even when a method lists the same thing twice", () => {
    const same = { kind: "custom", label: "Branch", value: "Downtown" };
    const keys = keyedDetails([same, { ...same }, { kind: "email", label: "", value: "a@b.co" }]).map(
      (entry) => entry.key,
    );
    expect(new Set(keys).size).toBe(3);
  });

  test("a detail keeps its key when another is put in front of it", () => {
    const email = { kind: "email", label: "", value: "a@b.co" };
    const [alone] = keyedDetails([email]);
    const moved = keyedDetails([{ kind: "phone", label: "", value: "+14155552671" }, email]);
    expect(moved[1]?.key).toBe(alone?.key);
  });
});

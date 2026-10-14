/** Unit tests for how a payment method is summarised, copied and linked. */

import { describe, expect, test } from "vitest";
import {
  changeClock,
  detailCopyText,
  keyedDetails,
  linkHost,
  methodCopyText,
  methodDisplayName,
  methodCurrencyLabel,
  methodCurrencyPhrase,
  methodSummary,
  recentChange,
  valueTail,
  type ChangeContext,
  type ChangeMarked,
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
   * Builds a method's stamps.
   *
   * @param overrides - Stamps to replace on a method added a year ago and never touched.
   * @returns The method.
   */
  const marked = (overrides: Partial<ChangeMarked>): ChangeMarked => ({
    id: "method-shown",
    currency: "USD",
    createdAt: daysAgo(365),
    updatedAt: daysAgo(365),
    preferred: false,
    preferredAt: "",
    ...overrides,
  });
  /**
   * Reads the note for a method whose owner has no other methods and never removed one.
   *
   * @param method - The method being shown.
   * @param context - Parts of the context to replace.
   * @returns The note.
   */
  const noteFor = (method: ChangeMarked, context: Partial<ChangeContext> = {}) =>
    recentChange(method, { nowMs, removedAt: "", methods: [method], ...context });
  const edited = (editedDaysAgo: number) => marked({ updatedAt: daysAgo(editedDaysAgo) });
  const added = (addedDaysAgo: number) =>
    marked({ createdAt: daysAgo(addedDaysAgo), updatedAt: daysAgo(addedDaysAgo) });

  test("an edited method says how recently it changed, for two weeks", () => {
    expect(noteFor(edited(0))).toEqual({ text: "Changed today", caution: true });
    expect(noteFor(edited(1))).toEqual({ text: "Changed yesterday", caution: true });
    expect(noteFor(edited(2))).toEqual({ text: "Changed 2 days ago", caution: true });
    expect(noteFor(edited(14))?.text).toBe("Changed 14 days ago");
    expect(noteFor(edited(15))).toBeUndefined();
  });

  test("a method that was only ever added says so, without the alarm", () => {
    expect(noteFor(added(0))).toEqual({ text: "Added today", caution: false });
    expect(noteFor(added(3))).toEqual({ text: "Added 3 days ago", caution: false });
    expect(noteFor(added(400))).toBeUndefined();
  });

  test("a change the clock puts in the future is a change made today, not nothing", () => {
    // A payer whose clock is two minutes slow, looking at an edit made a minute ago.
    const aMinuteAhead = new Date(nowMs + 60_000).toISOString();
    expect(noteFor(marked({ updatedAt: aMinuteAhead }))).toEqual({
      text: "Changed today",
      caution: true,
    });
    expect(noteFor(edited(-2))).toEqual({ text: "Changed today", caution: true });
  });

  test("a new method whose owner removed another one recently is a replacement, and a warning", () => {
    expect(noteFor(added(0), { removedAt: daysAgo(0) })).toEqual({
      text: "Added today, and another method was removed recently",
      caution: true,
    });
    // Whichever came first: removed then added, or added then removed.
    expect(noteFor(added(2), { removedAt: daysAgo(5) })?.caution).toBe(true);
    expect(noteFor(added(5), { removedAt: daysAgo(2) })?.caution).toBe(true);
    // A removal long ago has nothing to do with a method added now.
    expect(noteFor(added(1), { removedAt: daysAgo(60) })).toEqual({
      text: "Added yesterday",
      caution: false,
    });
    // And an old method is not made suspect by a removal.
    expect(noteFor(marked({}), { removedAt: daysAgo(0) })).toBeUndefined();
  });

  test("a method that recently took the star from an older one is a warning", () => {
    const older = marked({ id: "method-older" });
    const starred = marked({ preferred: true, preferredAt: daysAgo(1) });
    expect(noteFor(starred, { methods: [older, starred] })).toEqual({
      text: "Made the preferred method yesterday",
      caution: true,
    });
    // A brand-new method added already starred, with an older one beside it.
    const newcomer = marked({
      createdAt: daysAgo(0),
      updatedAt: daysAgo(0),
      preferred: true,
      preferredAt: daysAgo(0),
    });
    expect(noteFor(newcomer, { methods: [older, newcomer] })).toEqual({
      text: "Made the preferred method today",
      caution: true,
    });
  });

  test("a first method added with its star is simply new", () => {
    const first = marked({
      createdAt: daysAgo(0),
      updatedAt: daysAgo(0),
      preferred: true,
      preferredAt: daysAgo(0),
    });
    expect(noteFor(first)).toEqual({ text: "Added today", caution: false });
  });

  test("an older method in another currency was never a rival for the star", () => {
    const taka = marked({ id: "method-taka", currency: "BDT" });
    const dollars = marked({
      createdAt: daysAgo(0),
      updatedAt: daysAgo(0),
      preferred: true,
      preferredAt: daysAgo(0),
    });
    expect(noteFor(dollars, { methods: [taka, dollars] })).toEqual({
      text: "Added today",
      caution: false,
    });
    // One that works in any currency was.
    const anyCurrency = marked({ id: "method-any", currency: "" });
    expect(noteFor(dollars, { methods: [anyCurrency, dollars] })?.caution).toBe(true);
  });

  test("an old star, a lost star and a star of unknown date say nothing", () => {
    const older = marked({ id: "method-older" });
    const oldStar = marked({ preferred: true, preferredAt: daysAgo(40) });
    const lostStar = marked({ preferred: false, preferredAt: daysAgo(1) });
    const undated = marked({ preferred: true, preferredAt: "" });
    for (const method of [oldStar, lostStar, undated]) {
      expect(noteFor(method, { methods: [older, method] })).toBeUndefined();
    }
  });

  test("an edit outranks a replacement, which outranks a moved star", () => {
    const older = marked({ id: "method-older" });
    const everything = marked({
      createdAt: daysAgo(3),
      updatedAt: daysAgo(1),
      preferred: true,
      preferredAt: daysAgo(2),
    });
    const context = { removedAt: daysAgo(3), methods: [older, everything] };
    expect(noteFor(everything, context)?.text).toBe("Changed yesterday");
    expect(noteFor({ ...everything, updatedAt: everything.createdAt }, context)?.text).toBe(
      "Added 3 days ago, and another method was removed recently",
    );
    expect(
      noteFor({ ...everything, updatedAt: everything.createdAt }, { methods: [older, everything] })
        ?.text,
    ).toBe("Made the preferred method 2 days ago");
  });

  test("a method copied from an old handle is dated before today and says nothing", () => {
    // The backfill dates a method from its owner's account, and created_at
    // sits a few milliseconds after updated_at to keep the old order.
    const copied = marked({
      createdAt: "2026-07-04T12:00:00.002Z",
      updatedAt: "2026-07-04T12:00:00.000Z",
    });
    expect(noteFor(copied)).toBeUndefined();
  });

  test("unreadable stamps fall back to the louder wording, or to nothing at all", () => {
    expect(noteFor(marked({ createdAt: "", updatedAt: daysAgo(1) }))?.caution).toBe(true);
    expect(noteFor(marked({ createdAt: "", updatedAt: "" }))).toBeUndefined();
    expect(noteFor(marked({ createdAt: daysAgo(3), updatedAt: "not a date" }))).toEqual({
      text: "Added 3 days ago",
      caution: false,
    });
    expect(noteFor(added(1), { removedAt: "not a date" })?.caution).toBe(false);
  });
});

describe("changeClock", () => {
  test("uses the server's clock when it sent one, and the device's when it did not", () => {
    expect(changeClock("2026-10-10T12:00:00.000Z", 5)).toBe(Date.parse("2026-10-10T12:00:00.000Z"));
    expect(changeClock("", 5)).toBe(5);
    expect(changeClock("soon", 5)).toBe(5);
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

describe("methodDisplayName", () => {
  test("a method the person defined is shown by its name alone", () => {
    expect(methodDisplayName({ name: "Chase checking", preset: "" })).toBe("Chase checking");
  });

  test("a built-in app's method names its app when its own name does not", () => {
    expect(methodDisplayName({ name: "Totally Zelle", preset: "venmo" })).toBe(
      "Totally Zelle (Venmo)",
    );
    expect(methodDisplayName({ name: "Business", preset: "cashapp" })).toBe("Business (Cash App)");
  });

  test("the app is not repeated when the name already says it", () => {
    expect(methodDisplayName({ name: "Venmo", preset: "venmo" })).toBe("Venmo");
    expect(methodDisplayName({ name: "venmo (business)", preset: "venmo" })).toBe(
      "venmo (business)",
    );
    expect(methodDisplayName({ name: "CashApp", preset: "cashapp" })).toBe("CashApp");
  });
});

/** Unit tests for the link a built-in app's method opens and what the payer is told about it. */

import { describe, expect, test } from "vitest";
import { formatMoney } from "../money/money";
import { appPaymentLink, type AppLinkRequest } from "./appLink";

/**
 * Builds a link request with defaults, so each test states only what it is about.
 *
 * @param overrides - Fields to replace on a $43.25 Venmo payment.
 * @returns A complete request.
 */
function request(overrides: Partial<AppLinkRequest>): AppLinkRequest {
  return {
    preset: "venmo",
    handle: "ani-paul",
    methodCurrency: "USD",
    amountCents: 4325,
    currency: "USD",
    note: "",
    ...overrides,
  };
}

describe("appPaymentLink, when the amount belongs in the link", () => {
  test("venmo carries a dollar amount and the note, and drops a leading @", () => {
    const link = appPaymentLink(request({ handle: "@ani-paul", note: " Zazie " }));
    expect(link?.url).toBe("https://venmo.com/ani-paul?txn=pay&amount=43.25&note=Zazie");
    expect(link?.carriesAmount).toBe(true);
    expect(link?.hint).toBe(
      `Opens Venmo with ${formatMoney(4325, "USD")} filled in. You still confirm it there.`,
    );
  });

  test("a venmo method set up for any currency still carries dollars", () => {
    expect(appPaymentLink(request({ methodCurrency: "" }))?.url).toBe(
      "https://venmo.com/ani-paul?txn=pay&amount=43.25",
    );
  });

  test("paypal always says which currency the amount is in", () => {
    const dollars = appPaymentLink(request({ preset: "paypal", handle: "anipaul", methodCurrency: "" }));
    expect(dollars?.url).toBe("https://paypal.me/anipaul/43.25USD");
    const euros = appPaymentLink(
      request({ preset: "paypal", handle: "anipaul", methodCurrency: "EUR", currency: "EUR", amountCents: 2500 }),
    );
    expect(euros?.url).toBe("https://paypal.me/anipaul/25.00EUR");
    expect(euros?.carriesAmount).toBe(true);
  });

  test("yen are whole numbers, never divided by a hundred", () => {
    const inYen = appPaymentLink(
      request({ preset: "paypal", handle: "anipaul", methodCurrency: "", currency: "JPY", amountCents: 3500 }),
    );
    expect(inYen?.url).toBe("https://paypal.me/anipaul/3500JPY");
    expect(inYen?.hint).toContain(formatMoney(3500, "JPY"));
  });

  test("small and large amounts are written to the last cent", () => {
    expect(appPaymentLink(request({ amountCents: 5 }))?.url).toContain("amount=0.05");
    expect(appPaymentLink(request({ amountCents: 100 }))?.url).toContain("amount=1.00");
    expect(appPaymentLink(request({ amountCents: 123456789 }))?.url).toContain("amount=1234567.89");
    // 0.1 + 0.2 territory: 1010 cents must not come out as 10.1 or 10.100000001.
    expect(appPaymentLink(request({ amountCents: 1010 }))?.url).toContain("amount=10.10");
  });
});

describe("appPaymentLink, when the amount must stay out of the link", () => {
  test("a taka debt paid through venmo opens venmo with no amount and says why", () => {
    const link = appPaymentLink(request({ currency: "BDT", amountCents: 350000 }));
    expect(link?.url).toBe("https://venmo.com/ani-paul?txn=pay");
    expect(link?.carriesAmount).toBe(false);
    expect(link?.hint).toBe(
      "Opens Venmo with no amount filled in. Venmo sends USD and this payment is in BDT.",
    );
  });

  test("a euro debt never reaches venmo as dollars, even from an any-currency method", () => {
    const link = appPaymentLink(request({ methodCurrency: "", currency: "EUR" }));
    expect(link?.url).not.toContain("amount");
    expect(link?.hint).toContain("Venmo sends USD and this payment is in EUR.");
  });

  test("a method set up for one currency does not take another the app could send", () => {
    const link = appPaymentLink(
      request({ preset: "paypal", handle: "anipaul", methodCurrency: "EUR", currency: "USD" }),
    );
    expect(link?.url).toBe("https://paypal.me/anipaul");
    expect(link?.hint).toBe(
      "Opens PayPal with no amount filled in. This PayPal is set up for EUR and this payment is in USD.",
    );
  });

  test("paypal is not handed a currency it does not send", () => {
    const link = appPaymentLink(
      request({ preset: "paypal", handle: "anipaul", methodCurrency: "", currency: "BDT" }),
    );
    expect(link?.url).toBe("https://paypal.me/anipaul");
    expect(link?.hint).toBe("Opens PayPal with no amount filled in. PayPal does not send BDT.");
  });

  test("dinars, kept to three decimals, are not a currency paypal sends", () => {
    const link = appPaymentLink(
      request({ preset: "paypal", handle: "anipaul", methodCurrency: "", currency: "KWD", amountCents: 12500 }),
    );
    expect(link?.carriesAmount).toBe(false);
    expect(link?.url).toBe("https://paypal.me/anipaul");
  });

  test("forints with a fraction cannot be written in the whole numbers paypal takes", () => {
    const whole = appPaymentLink(
      request({ preset: "paypal", handle: "anipaul", methodCurrency: "", currency: "HUF", amountCents: 350000 }),
    );
    expect(whole?.url).toBe("https://paypal.me/anipaul/3500HUF");
    const fraction = appPaymentLink(
      request({ preset: "paypal", handle: "anipaul", methodCurrency: "", currency: "HUF", amountCents: 350050 }),
    );
    expect(fraction?.url).toBe("https://paypal.me/anipaul");
    expect(fraction?.hint).toBe(
      "Opens PayPal with no amount filled in. PayPal takes whole HUF amounts only.",
    );
  });

  test("no amount typed yet means no amount in the link, and an invitation to type one", () => {
    for (const amountCents of [0, -500, Number.NaN, 12.5]) {
      const link = appPaymentLink(request({ amountCents }));
      expect(link?.url).toBe("https://venmo.com/ani-paul?txn=pay");
      expect(link?.carriesAmount).toBe(false);
    }
    expect(appPaymentLink(request({ amountCents: 0 }))?.hint).toBe(
      "Opens Venmo. Enter an amount here first and it will be filled in for you.",
    );
  });

  test("cash app never carries an amount, and says when the currency is not one it moves", () => {
    const dollars = appPaymentLink(request({ preset: "cashapp", handle: "$anipaul" }));
    expect(dollars?.url).toBe("https://cash.app/$anipaul");
    expect(dollars?.hint).toBe("Cash App can't carry an amount in a link. Type it in the app.");
    const taka = appPaymentLink(request({ preset: "cashapp", handle: "anipaul", currency: "BDT" }));
    expect(taka?.hint).toBe(
      "Cash App can't carry an amount in a link. Type it in the app. Cash App sends USD and GBP and this payment is in BDT.",
    );
  });

  test("zelle has no link at all", () => {
    const link = appPaymentLink(request({ preset: "zelle", handle: "me@example.com" }));
    expect(link?.url).toBe("");
    expect(link?.hint).toBe("Zelle has no shareable link. Paste this into your banking app.");
  });
});

describe("appPaymentLink and what it refuses to build", () => {
  test("a stored username that could not be a real one makes no link", () => {
    for (const handle of ["jordan lee", "a/../b?amount=999", "   ", "https://evil.example/x"]) {
      const link = appPaymentLink(request({ handle }));
      expect(link?.url).toBe("");
      expect(link?.carriesAmount).toBe(false);
    }
    expect(appPaymentLink(request({ handle: "jordan lee" }))?.hint).toBe(
      "This username can't be opened as a link. Search for it in Venmo.",
    );
  });

  test("a method that is not a built-in app's has no such link", () => {
    expect(appPaymentLink(request({ preset: "" }))).toBeUndefined();
    expect(appPaymentLink(request({ preset: "bank" }))).toBeUndefined();
    expect(appPaymentLink(request({ preset: "cash" }))).toBeUndefined();
    expect(appPaymentLink(request({ preset: "bogus" }))).toBeUndefined();
  });

  test("only https links to the app's own site are ever produced", () => {
    for (const preset of ["venmo", "cashapp", "paypal"]) {
      const link = appPaymentLink(request({ preset, handle: "handle", methodCurrency: "" }));
      expect(link?.url.startsWith("https://")).toBe(true);
    }
  });

  test("the note cannot add parameters of its own", () => {
    const link = appPaymentLink(request({ note: "lunch&amount=999" }));
    expect(link?.url).toBe("https://venmo.com/ani-paul?txn=pay&amount=43.25&note=lunch%26amount%3D999");
  });
});

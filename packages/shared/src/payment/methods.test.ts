/** Unit tests for the payment method registry and link builder. */

import { describe, expect, test } from "vitest";
import { findPaymentMethod, paymentLink, PAYMENT_METHOD_KEYS } from "./methods";

describe("payment methods", () => {
  test("US-first keys, and nothing region-specific", () => {
    expect(PAYMENT_METHOD_KEYS).toEqual([
      "venmo",
      "zelle",
      "cashapp",
      "paypal",
      "cash",
      "bank",
      "other",
    ]);
  });

  test("zelle takes a handle but has no link", () => {
    const zelle = findPaymentMethod("zelle");
    expect(zelle?.takesHandle).toBe(true);
    expect(zelle?.linkable).toBe(false);
    expect(paymentLink("zelle", "me@example.com", 1000, "dinner")).toBe("");
  });
});

describe("paymentLink", () => {
  test("venmo carries amount and note, and drops a leading @", () => {
    const link = paymentLink("venmo", "@ani-paul", 4325, "Zazie");
    expect(link).toBe("https://venmo.com/ani-paul?txn=pay&amount=43.25&note=Zazie");
  });

  test("venmo omits an empty note", () => {
    expect(paymentLink("venmo", "ani-paul", 500, "   ")).toBe(
      "https://venmo.com/ani-paul?txn=pay&amount=5.00",
    );
  });

  test("cash app links to the cashtag without an amount it cannot carry", () => {
    expect(paymentLink("cashapp", "$anipaul", 4325, "x")).toBe("https://cash.app/$anipaul");
    expect(findPaymentMethod("cashapp")?.linkCarriesAmount).toBe(false);
  });

  test("paypal.me puts the amount in the path", () => {
    expect(paymentLink("paypal", "anipaul", 4325, "x")).toBe("https://paypal.me/anipaul/43.25");
  });

  test("methods without handles have no link", () => {
    expect(paymentLink("cash", "", 100, "")).toBe("");
    expect(paymentLink("bank", "anything", 100, "")).toBe("");
  });

  test("a blank handle yields no link", () => {
    expect(paymentLink("venmo", "   ", 100, "")).toBe("");
  });

  test("only web URLs, never custom schemes that error without the app", () => {
    for (const methodKey of PAYMENT_METHOD_KEYS) {
      const link = paymentLink(methodKey, "handle", 100, "note");
      if (link) expect(link.startsWith("https://")).toBe(true);
    }
  });
});

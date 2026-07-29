/** Unit tests for the payment method registry and link builder. */

import { describe, expect, test } from "vitest";
import {
  displayHandle,
  findPaymentMethod,
  paymentLink,
  stripHandlePrefix,
  PAYMENT_METHOD_KEYS,
} from "./methods";

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

describe("stripHandlePrefix", () => {
  test("drops a sigil the user typed anyway", () => {
    expect(stripHandlePrefix("venmo", "@jordan-lee")).toBe("jordan-lee");
    expect(stripHandlePrefix("cashapp", "$jordanlee")).toBe("jordanlee");
  });

  test("leaves an already-bare handle alone, and is idempotent", () => {
    expect(stripHandlePrefix("venmo", "jordan-lee")).toBe("jordan-lee");
    const once = stripHandlePrefix("paypal", "https://paypal.me/jordanlee");
    expect(stripHandlePrefix("paypal", once)).toBe(once);
  });

  test("unpicks every shape of a pasted PayPal.Me URL", () => {
    // The realistic failure: copying the address bar rather than the name.
    for (const pasted of [
      "https://paypal.me/jordanlee",
      "http://paypal.me/jordanlee",
      "https://www.paypal.me/jordanlee",
      "paypal.me/jordanlee",
      "paypal.me/jordanlee/",
    ]) {
      expect(stripHandlePrefix("paypal", pasted)).toBe("jordanlee");
    }
  });

  test("repeated sigils collapse rather than leaving one behind", () => {
    expect(stripHandlePrefix("venmo", "@@jordan-lee")).toBe("jordan-lee");
  });

  test("zelle has no prefix to strip, so an email survives intact", () => {
    expect(stripHandlePrefix("zelle", "me@example.com")).toBe("me@example.com");
    expect(stripHandlePrefix("zelle", "+14015550147")).toBe("+14015550147");
  });

  test("trims surrounding whitespace from a paste", () => {
    expect(stripHandlePrefix("venmo", "  @jordan-lee  ")).toBe("jordan-lee");
  });
});

describe("displayHandle", () => {
  test("puts the sigil back for the payer to recognize", () => {
    expect(displayHandle("venmo", "jordan-lee")).toBe("@jordan-lee");
    expect(displayHandle("cashapp", "jordanlee")).toBe("$jordanlee");
    expect(displayHandle("paypal", "jordanlee")).toBe("paypal.me/jordanlee");
  });

  test("never doubles a prefix, whichever form was stored", () => {
    expect(displayHandle("venmo", "@jordan-lee")).toBe("@jordan-lee");
    expect(displayHandle("paypal", "https://paypal.me/jordanlee")).toBe("paypal.me/jordanlee");
  });

  test("an empty handle stays empty rather than becoming a bare sigil", () => {
    expect(displayHandle("venmo", "")).toBe("");
    expect(displayHandle("venmo", "   ")).toBe("");
  });

  test("zelle is shown exactly as registered", () => {
    expect(displayHandle("zelle", "me@example.com")).toBe("me@example.com");
  });
});

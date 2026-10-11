/** Unit tests for the payment method registry and its handle helpers. */

import { describe, expect, test } from "vitest";
import {
  displayHandle,
  findPaymentMethod,
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
  });

  test("each service says which currencies it moves, and the rest say nothing", () => {
    expect(findPaymentMethod("venmo")?.currencies).toEqual(["USD"]);
    expect(findPaymentMethod("zelle")?.currencies).toEqual(["USD"]);
    expect(findPaymentMethod("cashapp")?.currencies).toEqual(["USD", "GBP"]);
    expect(findPaymentMethod("paypal")?.currencies).toContain("EUR");
    expect(findPaymentMethod("paypal")?.currencies).not.toContain("BDT");
    expect(findPaymentMethod("cash")?.currencies).toBeUndefined();
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

  test("trailing slashes come off in time that grows with the input, not its square", () => {
    expect(stripHandlePrefix("paypal", "jordanlee///")).toBe("jordanlee");
    const started = performance.now();
    expect(stripHandlePrefix("paypal", `${"/".repeat(300_000)}x`)).toHaveLength(300_001);
    expect(performance.now() - started).toBeLessThan(1000);
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

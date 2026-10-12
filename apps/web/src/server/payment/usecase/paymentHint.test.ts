/** Unit tests for the payment sentence a reminder carries. */

import { describe, expect, it } from "vitest";
import { reminderPaymentHint } from "./paymentHint";

/**
 * Builds one method for the fixtures.
 *
 * @param name - Method name.
 * @param currency - ISO code, or "" for any currency.
 * @param preferred - Whether it is starred.
 * @returns The method.
 */
function method(name: string, currency: string, preferred = false) {
  return { name, currency, preferred };
}

describe("reminderPaymentHint", () => {
  it("names the starred method for the one currency owed", () => {
    expect(
      reminderPaymentHint("Rahim Uddin", [method("Nagad", "BDT"), method("bKash", "BDT", true)], ["BDT"]),
    ).toBe("Rahim prefers bKash.");
  });

  it("lists what works when nothing is starred, and never says prefers", () => {
    expect(
      reminderPaymentHint("Rahim", [method("bKash", "BDT"), method("Nagad", "BDT")], ["BDT"]),
    ).toBe("Rahim takes bKash and Nagad.");
    expect(reminderPaymentHint("Rahim", [method("bKash", "BDT")], ["BDT"])).toBe(
      "Rahim takes bKash.",
    );
  });

  it("lists three methods at most", () => {
    const methods = ["bKash", "Nagad", "Rocket", "Upay"].map((name) => method(name, "BDT"));
    expect(reminderPaymentHint("Rahim", methods, ["BDT"])).toBe(
      "Rahim takes bKash, Nagad and Rocket.",
    );
  });

  it("says which currency each method is for when they differ", () => {
    expect(
      reminderPaymentHint(
        "Rahim",
        [method("bKash", "BDT", true), method("Zelle", "USD")],
        ["BDT", "USD"],
      ),
    ).toBe("Rahim prefers bKash for BDT and takes Zelle for USD.");
  });

  it("drops the currency when one method covers everything owed", () => {
    expect(reminderPaymentHint("Rahim", [method("PayPal", "", true)], ["BDT", "USD"])).toBe(
      "Rahim prefers PayPal.",
    );
  });

  it("keeps the currency when only some of what is owed has a method", () => {
    expect(reminderPaymentHint("Rahim", [method("bKash", "BDT", true)], ["BDT", "USD"])).toBe(
      "Rahim prefers bKash for BDT.",
    );
  });

  it("says nothing when no method works in a currency owed", () => {
    expect(reminderPaymentHint("Rahim", [method("Zelle", "USD", true)], ["BDT"])).toBe("");
    expect(reminderPaymentHint("Rahim", [], ["BDT"])).toBe("");
  });
});

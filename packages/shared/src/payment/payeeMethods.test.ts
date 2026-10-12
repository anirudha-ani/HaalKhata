/** Unit tests for which payment methods a payer sees for a currency, and in what order. */

import { describe, expect, test } from "vitest";
import {
  defaultMethod,
  defaultPayChoice,
  methodsForCurrency,
  preferredMethod,
  settlementMethodKey,
} from "./payeeMethods";

/** A method reduced to what ordering reads, plus a name to assert on. */
interface NamedMethod {
  name: string;
  currency: string;
  preferred: boolean;
}

/**
 * Builds one method for the fixtures.
 *
 * @param name - Name asserted on.
 * @param currency - ISO code, or "" for any currency.
 * @param preferred - Whether it is starred.
 * @returns The method.
 */
function method(name: string, currency: string, preferred = false): NamedMethod {
  return { name, currency, preferred };
}

/**
 * Reads the names off a list of methods.
 *
 * @param methods - Methods to read.
 * @returns Their names, in order.
 */
function names(methods: readonly NamedMethod[]): string[] {
  return methods.map((entry) => entry.name);
}

describe("methodsForCurrency", () => {
  const methods = [
    method("Zelle", "USD"),
    method("PayPal", ""),
    method("Nagad", "BDT"),
    method("bKash", "BDT", true),
    method("Venmo", "USD", true),
  ];

  test("lists what works in the currency, starred first, then the owner's order", () => {
    const forTaka = methodsForCurrency(methods, "BDT");
    expect(names(forTaka.usable)).toEqual(["bKash", "Nagad", "PayPal"]);
    expect(names(forTaka.others)).toEqual(["Zelle", "Venmo"]);
  });

  test("a star in one currency says nothing about another", () => {
    expect(names(methodsForCurrency(methods, "USD").usable)).toEqual(["Venmo", "Zelle", "PayPal"]);
  });

  test("a currency nobody set up still offers the any-currency methods", () => {
    const forEuro = methodsForCurrency(methods, "EUR");
    expect(names(forEuro.usable)).toEqual(["PayPal"]);
    expect(names(forEuro.others)).toEqual(["Zelle", "Nagad", "bKash", "Venmo"]);
  });

  test("a starred any-currency method outranks an unstarred one in the currency", () => {
    const starredAny = [method("Wise", "EUR"), method("PayPal", "", true)];
    expect(names(methodsForCurrency(starredAny, "EUR").usable)).toEqual(["PayPal", "Wise"]);
  });

  test("a method starred for the currency outranks a starred any-currency one", () => {
    const bothStarred = [method("PayPal", "", true), method("Wise", "EUR", true)];
    expect(names(methodsForCurrency(bothStarred, "EUR").usable)).toEqual(["Wise", "PayPal"]);
  });

  test("compares currency codes without regard to case", () => {
    expect(names(methodsForCurrency([method("bKash", "bdt")], "BDT").usable)).toEqual(["bKash"]);
  });
});

describe("defaultMethod and preferredMethod", () => {
  test("the dialog opens on the best usable method, starred or not", () => {
    expect(defaultMethod([method("Nagad", "BDT"), method("Rocket", "BDT")], "BDT")?.name).toBe(
      "Nagad",
    );
    expect(defaultMethod([method("Zelle", "USD")], "BDT")).toBeUndefined();
    expect(defaultMethod([], "BDT")).toBeUndefined();
  });

  test("only a starred method is ever called preferred", () => {
    expect(preferredMethod([method("Nagad", "BDT")], "BDT")).toBeUndefined();
    expect(preferredMethod([method("Nagad", "BDT"), method("bKash", "BDT", true)], "BDT")?.name).toBe(
      "bKash",
    );
    expect(preferredMethod([method("PayPal", "", true)], "BDT")?.name).toBe("PayPal");
    expect(preferredMethod([method("Venmo", "USD", true)], "BDT")).toBeUndefined();
  });
});

describe("defaultPayChoice", () => {
  test("opens on the best usable method, and on cash when there is none", () => {
    const methods = [
      { id: "method-zelle", currency: "USD", preferred: false },
      { id: "method-bkash", currency: "BDT", preferred: true },
    ];
    expect(defaultPayChoice(methods, "BDT")).toBe("method-bkash");
    expect(defaultPayChoice(methods, "USD")).toBe("method-zelle");
    expect(defaultPayChoice(methods, "EUR")).toBe("cash");
    expect(defaultPayChoice([], "USD")).toBe("cash");
  });
});

describe("settlementMethodKey", () => {
  const detail = (kind: string) => ({ kind, label: "", value: "x" });

  test("a built-in app is recorded under its own key", () => {
    expect(settlementMethodKey("", { preset: "venmo", details: [detail("username")] })).toBe("venmo");
    expect(settlementMethodKey("", { preset: "zelle", details: [detail("email")] })).toBe("zelle");
  });

  test("a method with bank details is a bank transfer", () => {
    for (const kind of ["account_number", "iban", "routing_number", "swift"]) {
      expect(
        settlementMethodKey("", { preset: "", details: [detail("account_name"), detail(kind)] }),
      ).toBe("bank");
    }
  });

  test("any other method a person defined is other", () => {
    expect(settlementMethodKey("", { preset: "", details: [detail("phone")] })).toBe("other");
    expect(settlementMethodKey("", { preset: "", details: [detail("custom")] })).toBe("other");
  });

  test("a plain choice keeps its key, and anything unknown is other", () => {
    expect(settlementMethodKey("cash")).toBe("cash");
    expect(settlementMethodKey("other")).toBe("other");
    expect(settlementMethodKey("carrier-pigeon")).toBe("other");
    expect(settlementMethodKey("")).toBe("other");
  });
});

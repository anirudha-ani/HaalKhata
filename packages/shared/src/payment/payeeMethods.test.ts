/** Unit tests for which payment methods a payer sees for a currency, and in what order. */

import { describe, expect, test } from "vitest";
import { defaultMethod, methodsForCurrency, preferredMethod } from "./payeeMethods";

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

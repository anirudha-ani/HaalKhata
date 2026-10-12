/** Unit tests for the prompt that tells someone people owe them and have nowhere to send it. */

import { describe, expect, test } from "vitest";
import { findPayPrompt, owedLine } from "./payPrompt";

/**
 * Builds a counterparty with one balance per currency given.
 *
 * @param name - Display name.
 * @param balances - Currency code to cents; positive means they owe.
 * @returns The counterparty.
 */
function person(name: string, balances: Record<string, number>) {
  return {
    name,
    balances: Object.entries(balances).map(([currency, cents]) => ({ currency, cents })),
  };
}

const VENMO = { currency: "USD", preferred: true };
const BKASH = { currency: "BDT", preferred: false };
const PAYPAL = { currency: "", preferred: false };

describe("findPayPrompt", () => {
  test("prompts for a currency the person is owed in and has no method for", () => {
    const prompt = findPayPrompt(
      [person("Pia Payer", { BDT: 120000 }), person("Rahim Uddin", { BDT: 30000 })],
      [VENMO],
      ["USD", "BDT"],
    );
    // Totalled, with the people who owe the most named first, by first name.
    expect(prompt).toEqual({ currency: "BDT", cents: 150000, names: ["Pia", "Rahim"] });
  });

  test("says nothing when a method works in every currency owed", () => {
    expect(findPayPrompt([person("Pia", { USD: 3500, BDT: 100 })], [VENMO, BKASH], ["USD"])).toBeUndefined();
  });

  test("an any-currency method covers every currency", () => {
    expect(findPayPrompt([person("Pia", { EUR: 4000, BDT: 100 })], [PAYPAL], ["USD"])).toBeUndefined();
  });

  test("says nothing about a currency the person owes in, or is square in", () => {
    expect(
      findPayPrompt([person("Pia", { USD: -3500, EUR: 0 })], [], ["USD", "EUR"]),
    ).toBeUndefined();
    expect(findPayPrompt([], [], ["USD"])).toBeUndefined();
  });

  test("only the people who owe in that currency are counted", () => {
    const prompt = findPayPrompt(
      [person("Pia", { EUR: 4000 }), person("Rahim", { EUR: -1000 }), person("Sam", { USD: 500 })],
      [VENMO],
      ["USD", "EUR"],
    );
    expect(prompt).toEqual({ currency: "EUR", cents: 4000, names: ["Pia"] });
  });

  test("takes one currency at a time, in the order the screen lists them", () => {
    const people = [person("Pia", { EUR: 4000, BDT: 100, USD: 5 })];
    expect(findPayPrompt(people, [], ["USD", "EUR", "BDT"])?.currency).toBe("USD");
    // With a dollar method added, the next gap surfaces by itself.
    expect(findPayPrompt(people, [VENMO], ["USD", "EUR", "BDT"])?.currency).toBe("EUR");
    // A currency the screen did not list still gets its turn, after the listed ones.
    expect(findPayPrompt(people, [VENMO], ["USD", "BDT"])?.currency).toBe("BDT");
    expect(findPayPrompt(people, [VENMO, BKASH], ["USD", "BDT"])?.currency).toBe("EUR");
  });
});

describe("owedLine", () => {
  test("names one or two people and counts more", () => {
    expect(owedLine(["Pia"], "$35.00")).toBe("Pia owes you $35.00");
    expect(owedLine(["Pia", "Rahim"], "$35.00")).toBe("Pia and Rahim owe you $35.00");
    expect(owedLine(["Pia", "Rahim", "Sam"], "$35.00")).toBe("3 people owe you $35.00");
  });
});

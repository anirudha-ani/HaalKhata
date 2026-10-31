/** Tests for the reader's own money line on an expense notification. */

import { describe, expect, it } from "vitest";
import { formatMoney } from "@haalkhata/shared/money/money";
import { readerShareLine, removedReaderLine, type ExpenseMoney } from "./readerShareLine";

const DINNER: ExpenseMoney = {
  currency: "BDT",
  payers: [{ userId: "ani", amountCents: 240_000 }],
  splits: [
    { userId: "ani", owedCents: 60_000 },
    { userId: "boba", owedCents: 60_000 },
    { userId: "chad", owedCents: 120_000 },
  ],
};
const NAMES = new Map([["ani", "Ani"]]);

describe("readerShareLine", () => {
  it("names the one payer and what the reader owes them", () => {
    expect(readerShareLine(DINNER, "boba", "added", NAMES)).toBe(`you owe Ani ${formatMoney(60_000, "BDT")}`);
  });

  it("tells the payer what comes back to them", () => {
    expect(readerShareLine(DINNER, "ani", "added", NAMES)).toBe(`you get back ${formatMoney(180_000, "BDT")}`);
  });

  it("says 'now' after an edit", () => {
    expect(readerShareLine(DINNER, "chad", "updated", NAMES)).toBe(`now you owe Ani ${formatMoney(120_000, "BDT")}`);
  });

  it("says nothing about a deleted expense", () => {
    expect(readerShareLine(DINNER, "boba", "deleted", NAMES)).toBe("");
  });

  it("says nothing when the reader comes out even", () => {
    const even: ExpenseMoney = {
      currency: "USD",
      payers: [{ userId: "boba", amountCents: 500 }, { userId: "ani", amountCents: 500 }],
      splits: [{ userId: "boba", owedCents: 500 }, { userId: "ani", owedCents: 500 }],
    };
    expect(readerShareLine(even, "boba", "added", NAMES)).toBe("");
  });

  it("does not pick one of several payers to owe", () => {
    const shared: ExpenseMoney = {
      currency: "USD",
      payers: [{ userId: "ani", amountCents: 600 }, { userId: "chad", amountCents: 600 }],
      splits: [{ userId: "boba", owedCents: 1_200 }],
    };
    expect(readerShareLine(shared, "boba", "added", new Map([["ani", "Ani"], ["chad", "Chad"]]))).toBe(
      `you owe ${formatMoney(1_200, "USD")}`,
    );
  });

  it("falls back to no name when the payer's name is unknown", () => {
    expect(readerShareLine(DINNER, "boba", "added", new Map())).toBe(`you owe ${formatMoney(60_000, "BDT")}`);
  });
});

describe("removedReaderLine", () => {
  it("tells somebody taken off what they no longer owe, naming the payer", () => {
    expect(removedReaderLine(DINNER, "boba", NAMES)).toBe(
      `you no longer owe Ani ${formatMoney(60_000, "BDT")}`,
    );
  });

  it("tells the payer taken off what they no longer get back", () => {
    expect(removedReaderLine(DINNER, "ani", NAMES)).toBe(
      `you no longer get back ${formatMoney(180_000, "BDT")}`,
    );
  });

  it("says only that they are off it when it had left them even", () => {
    const even: ExpenseMoney = {
      currency: "BDT",
      payers: [{ userId: "boba", amountCents: 60_000 }],
      splits: [{ userId: "boba", owedCents: 60_000 }],
    };
    expect(removedReaderLine(even, "boba", NAMES)).toBe("you're no longer on it");
  });
});

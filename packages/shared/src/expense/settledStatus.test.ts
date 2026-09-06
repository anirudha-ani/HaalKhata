/** Unit tests for the nothing-pending wording on expense rows. */

import { describe, expect, it } from "vitest";
import { settledStatus } from "./settledStatus";

describe("settledStatus", () => {
  it("speaks in the viewer's direction", () => {
    // The whole point of replacing "settled": a lender and a borrower are in
    // different situations, and one word for both flattened the truth.
    expect(settledStatus(true, true, []).label).toBe("no one owes you here");
    expect(settledStatus(false, true, []).label).toBe("you owe nothing here");
  });

  it("never claims the expense itself was paid", () => {
    // A scope can reach zero by offsetting expenses with no payment at all,
    // so neither the label nor the explanation may say "paid" or "settled"
    // about the expense — only about the state between the people.
    for (const lent of [true, false]) {
      const status = settledStatus(lent, true, []);
      expect(status.label).not.toMatch(/paid|settled/);
      expect(status.explanation).not.toMatch(/this expense (was|is) (paid|settled)/);
    }
  });

  it("explains a group row by the group balance", () => {
    expect(settledStatus(true, true, []).explanation).toBe(
      "Your balance in this group is zero — nothing from this expense is pending.",
    );
  });

  it("explains a one-off row by the people on it", () => {
    expect(settledStatus(false, false, ["Ana"]).explanation).toBe(
      "You and Ana are settled up — nothing from this expense is pending.",
    );
  });

  it("joins several names the way a sentence would", () => {
    expect(settledStatus(false, false, ["Ana", "Bob", "Chen"]).explanation).toContain(
      "You and Ana, Bob & Chen are settled up",
    );
  });

  it("survives missing names rather than printing an empty gap", () => {
    expect(settledStatus(false, false, []).explanation).toContain("You and the others");
  });
});

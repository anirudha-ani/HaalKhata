/** Tests for counting one person's expenses by split type. */

import { describe, expect, it } from "vitest";
import { expenseCountOf } from "./expenseCountOf";
import { ANIKA, LATECOMER, RIFAT } from "./peopleFixtures";

describe("expenseCountOf", () => {
  it("adds every type when no type is chosen", () => {
    expect(expenseCountOf(ANIKA, "all")).toBe(6);
  });

  it("counts one type alone", () => {
    expect(expenseCountOf(ANIKA, "itemized")).toBe(2);
    expect(expenseCountOf(RIFAT, "itemized")).toBe(0);
  });

  it("is zero for someone who has added nothing", () => {
    expect(expenseCountOf(LATECOMER, "all")).toBe(0);
  });
});

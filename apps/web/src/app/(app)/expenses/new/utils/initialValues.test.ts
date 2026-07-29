/** Unit tests for the expense form's initial state, focused on the edit path. */

import { describe, expect, it } from "vitest";
import type { Expense } from "@haalkhata/protogen/expense/v1/expense_pb";
import { buildInitialValues } from "./initialValues";
import { buildItemsPayload } from "@/lib/expense/splitForm";

const NO_PARAMS = { initialGroupId: "", initialFriendId: "" };
const MINE = "me";

/**
 * Builds an itemized expense shaped like one the server returns.
 *
 * @param overrides - Fields to replace on the base expense.
 * @returns An Expense for {@link buildInitialValues}.
 */
function itemizedExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    groupId: "grp-1",
    description: "PICCOLO FORNO",
    amountCents: 6109,
    currency: "USD",
    expenseDate: "2025-12-12",
    category: "general",
    notes: "",
    splitType: "itemized",
    taxCents: 444,
    tipCents: 515,
    payers: [{ userId: MINE, amountCents: 6109 }],
    splits: [
      { userId: MINE, owedCents: 1840 },
      { userId: "ani", owedCents: 2432 },
      { userId: "t2", owedCents: 1837 },
    ],
    items: [
      {
        id: "item-1",
        name: "Spaghetti Carbonara",
        quantity: 1,
        totalCents: 2000,
        assignments: [
          { userId: MINE, weight: 1 },
          { userId: "t2", weight: 1 },
          { userId: "ani", weight: 1 },
        ],
      },
      {
        id: "item-2",
        name: "Pappardelle Ragu",
        quantity: 1,
        totalCents: 2200,
        assignments: [
          { userId: MINE, weight: 1 },
          { userId: "ani", weight: 1 },
          { userId: "t2", weight: 1 },
        ],
      },
      {
        id: "item-3",
        name: "Tiramisu",
        quantity: 2,
        totalCents: 950,
        assignments: [{ userId: "ani", weight: 3 }],
      },
    ],
    ...overrides,
  } as Expense;
}

describe("buildInitialValues — editing an itemized expense", () => {
  it("reopens as itemized rather than silently becoming an equal split", () => {
    // The bug this guards: coercing to "equal" here meant saving an edit
    // rewrote a correct itemized expense as a wrong even one.
    expect(buildInitialValues(NO_PARAMS, MINE, itemizedExpense()).splitType).toBe("itemized");
  });

  it("restores every line with its name, money string and quantity", () => {
    const { items } = buildInitialValues(NO_PARAMS, MINE, itemizedExpense());
    expect(items).toHaveLength(3);
    expect(items[0].name).toBe("Spaghetti Carbonara");
    expect(items[0].total).toBe("20.00");
    expect(items[2].name).toBe("Tiramisu");
    expect(items[2].total).toBe("9.50");
    expect(items[2].quantity).toBe(2);
  });

  it("restores who is on each line, and their weights", () => {
    const { items } = buildInitialValues(NO_PARAMS, MINE, itemizedExpense());
    expect(items[0].assignees).toEqual({ me: 1, t2: 1, ani: 1 });
    // A weight other than 1 has to survive, or an uneven share silently
    // becomes an even one on the next save.
    expect(items[2].assignees).toEqual({ ani: 3 });
  });

  it("gives each row a fresh key rather than reusing the server id", () => {
    const { items } = buildInitialValues(NO_PARAMS, MINE, itemizedExpense());
    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("item-1");
  });

  it("restores tax and tip as money strings", () => {
    const initial = buildInitialValues(NO_PARAMS, MINE, itemizedExpense());
    expect(initial.taxInput).toBe("4.44");
    expect(initial.tipInput).toBe("5.15");
  });

  it("leaves tax and tip blank when there were none, not '0.00'", () => {
    // An empty field reads as "none"; a zero reads as a decision someone made.
    const initial = buildInitialValues(
      NO_PARAMS,
      MINE,
      itemizedExpense({ taxCents: 0, tipCents: 0 }),
    );
    expect(initial.taxInput).toBe("");
    expect(initial.tipInput).toBe("");
  });

  it("keeps the item total summing to the amount it was saved with", () => {
    // items + tax + tip must still reconcile after the round trip through
    // money strings, or an untouched save would change the expense.
    const initial = buildInitialValues(NO_PARAMS, MINE, itemizedExpense());
    const itemsTotal = initial.items.reduce(
      (running, item) => running + Math.round(Number(item.total) * 100),
      0,
    );
    const taxCents = Math.round(Number(initial.taxInput) * 100);
    const tipCents = Math.round(Number(initial.tipInput) * 100);
    expect(itemsTotal + taxCents + tipCents).toBe(itemizedExpense().amountCents);
  });
});

describe("round trip — opening an edit and saving it unchanged", () => {
  it("serializes back to exactly the items that were stored", () => {
    // The property that makes editing safe at all: restore then submit has to
    // be identity. If it is not, opening an expense and pressing Save without
    // touching anything silently rewrites it — the worst possible bug in a
    // ledger, because nothing looks wrong at the time.
    const expense = itemizedExpense();
    const initial = buildInitialValues(NO_PARAMS, MINE, expense);

    expect(buildItemsPayload(initial.items)).toEqual(
      expense.items.map((item) => ({
        // Ids are dropped on the way out: UpdateExpense replaces the receipt
        // wholesale rather than diffing rows.
        id: "",
        name: item.name,
        quantity: item.quantity,
        totalCents: item.totalCents,
        assignments: item.assignments.map((assignment) => ({
          userId: assignment.userId,
          weight: assignment.weight,
        })),
      })),
    );
  });

  it("survives a cent that does not divide evenly", () => {
    // 33.33 across three people is where a money-string round trip would lose
    // a cent if centsToInput and parseMoneyInput ever disagreed.
    const expense = itemizedExpense({
      taxCents: 0,
      tipCents: 0,
      amountCents: 3333,
      items: [
        {
          id: "odd",
          name: "Split three ways",
          quantity: 1,
          totalCents: 3333,
          assignments: [
            { userId: MINE, weight: 1 },
            { userId: "ani", weight: 1 },
            { userId: "t2", weight: 1 },
          ],
        },
      ],
    } as Partial<Expense>);
    const initial = buildInitialValues(NO_PARAMS, MINE, expense);
    expect(buildItemsPayload(initial.items)[0].totalCents).toBe(3333);
  });
});

describe("buildInitialValues — non-itemized edits still behave", () => {
  it("keeps an exact split's per-person inputs", () => {
    const expense = itemizedExpense({
      splitType: "exact",
      items: [],
      taxCents: 0,
      tipCents: 0,
    });
    const initial = buildInitialValues(NO_PARAMS, MINE, expense);
    expect(initial.splitType).toBe("exact");
    expect(initial.splitInputs).toEqual({ me: "18.40", ani: "24.32", t2: "18.37" });
    expect(initial.items).toEqual([]);
  });
});

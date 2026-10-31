/** Two people editing one expense at once: what merges, what conflicts, and that the money always reconciles. */

import { describe, expect, it } from "vitest";
import { sameExpense, sameMoney, type ExpenseState, type LineState } from "./expenseState";
import { mergeExpenseEdit } from "./mergeExpenseEdit";

const SARA = "user-sara";
const TOMAS = "user-tomas";
const NOOR = "user-noor";
const PRIYA = "user-priya";

/**
 * A line of a receipt.
 *
 * @param lineId - Its id.
 * @param name - Its name.
 * @param totalCents - Its price.
 * @param shares - Who is on it.
 * @returns The line.
 */
function line(lineId: string, name: string, totalCents: number, shares: Record<string, number> = {}): LineState {
  return { id: lineId, name, quantity: 1, totalCents, shares };
}

/** A dinner Sara paid for: pizza on Tomas, beer on Priya. */
const dinner: ExpenseState = {
  description: "Dinner",
  category: "food",
  expenseDate: "2026-10-29",
  notes: "",
  splitType: "itemized",
  amountCents: 2800,
  owed: { [TOMAS]: 2000, [PRIYA]: 800 },
  payers: { [SARA]: 2800 },
  lines: [line("pizza", "Pizza", 2000, { [TOMAS]: 1 }), line("beer", "Beer", 800, { [PRIYA]: 1 })],
  taxCents: 0,
  tipCents: 0,
};

/** Groceries Sara paid for, split equally between three. */
const groceries: ExpenseState = {
  description: "Groceries",
  category: "general",
  expenseDate: "2026-10-29",
  notes: "",
  splitType: "equal",
  amountCents: 10000,
  owed: { [SARA]: 3334, [TOMAS]: 3333, [PRIYA]: 3333 },
  payers: { [SARA]: 10000 },
  lines: [],
  taxCents: 0,
  tipCents: 0,
};

/**
 * The same state with one line changed.
 *
 * @param state - The state.
 * @param lineId - The line.
 * @param change - What to change on it.
 * @returns The new state.
 */
function withLine(state: ExpenseState, lineId: string, change: Partial<LineState>): ExpenseState {
  return { ...state, lines: state.lines.map((entry) => (entry.id === lineId ? { ...entry, ...change } : entry)) };
}

describe("parts two people changed separately", () => {
  it("keeps both when each changed a different field", () => {
    const outcome = mergeExpenseEdit(
      groceries,
      { ...groceries, expenseDate: "2026-10-28" },
      { ...groceries, description: "Weekly shop" },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.description).toBe("Weekly shop");
    expect(outcome.merged.expenseDate).toBe("2026-10-28");
    expect(outcome.theirChanges).toEqual([{ part: "description" }]);
  });

  it("keeps a changed amount when the other person only changed the date", () => {
    const outcome = mergeExpenseEdit(
      groceries,
      { ...groceries, expenseDate: "2026-10-28" },
      { ...groceries, amountCents: 9600, owed: { [SARA]: 3200, [TOMAS]: 3200, [PRIYA]: 3200 }, payers: { [SARA]: 9600 } },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.amountCents).toBe(9600);
    expect(outcome.merged.owed[TOMAS]).toBe(3200);
    expect(outcome.merged.expenseDate).toBe("2026-10-28");
  });

  it("takes each person's lines when they changed different lines, and works the bill out again", () => {
    const outcome = mergeExpenseEdit(
      dinner,
      withLine(dinner, "pizza", { totalCents: 1800 }),
      withLine(dinner, "beer", { shares: { [SARA]: 1 } }),
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.lines).toEqual([
      line("pizza", "Pizza", 1800, { [TOMAS]: 1 }),
      line("beer", "Beer", 800, { [SARA]: 1 }),
    ]);
    expect(outcome.merged.amountCents).toBe(2600);
    expect(outcome.merged.owed).toEqual({ [TOMAS]: 1800, [SARA]: 800 });
    expect(outcome.merged.payers).toEqual({ [SARA]: 2600 });
  });

  it("lets two people claim the same line at once", () => {
    const outcome = mergeExpenseEdit(
      dinner,
      withLine(dinner, "pizza", { shares: { [TOMAS]: 1, [SARA]: 1 } }),
      withLine(dinner, "pizza", { shares: { [TOMAS]: 1, [PRIYA]: 1 } }),
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.lines[0].shares).toEqual({ [TOMAS]: 1, [SARA]: 1, [PRIYA]: 1 });
  });

  it("keeps a line each of them added", () => {
    const outcome = mergeExpenseEdit(
      dinner,
      { ...dinner, lines: [...dinner.lines, line("", "Salad", 900, { [SARA]: 1 })] },
      { ...dinner, lines: [...dinner.lines, line("wine", "Wine", 1200, { [TOMAS]: 1 })] },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.lines.map((entry) => entry.name)).toEqual(["Pizza", "Beer", "Wine", "Salad"]);
    expect(outcome.merged.amountCents).toBe(4900);
  });

  it("removes a line one person removed and nobody else touched", () => {
    const outcome = mergeExpenseEdit(
      dinner,
      { ...dinner, lines: [dinner.lines[0]] },
      { ...dinner, notes: "Birthday" },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.lines.map((entry) => entry.id)).toEqual(["pizza"]);
    expect(outcome.merged.notes).toBe("Birthday");
    expect(outcome.merged.amountCents).toBe(2000);
  });

  it("leaves a line somebody else removed gone when this person did not touch it", () => {
    const outcome = mergeExpenseEdit(
      dinner,
      { ...dinner, notes: "Birthday" },
      { ...dinner, lines: [dinner.lines[0]], amountCents: 2000, owed: { [TOMAS]: 2000 }, payers: { [SARA]: 2000 } },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.lines.map((entry) => entry.id)).toEqual(["pizza"]);
    expect(outcome.theirChanges).toEqual([{ part: "line", lineId: "beer" }]);
  });

  it("merges tax and tip like any other part", () => {
    const outcome = mergeExpenseEdit(
      dinner,
      { ...dinner, tipCents: 400 },
      { ...dinner, taxCents: 280, amountCents: 3080, owed: { [TOMAS]: 2200, [PRIYA]: 880 }, payers: { [SARA]: 3080 } },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.taxCents).toBe(280);
    expect(outcome.merged.tipCents).toBe(400);
    expect(outcome.merged.amountCents).toBe(3480);
    const owedCents = Object.values(outcome.merged.owed).reduce((running, cents) => running + cents, 0);
    expect(owedCents).toBe(3480);
  });
});

describe("the same part changed by two people", () => {
  it("is a conflict when the values differ, holding this person's value", () => {
    const outcome = mergeExpenseEdit(
      groceries,
      { ...groceries, description: "Supper" },
      { ...groceries, description: "Weekly shop" },
    );

    expect(outcome.conflicts).toEqual([
      { edit: { part: "description" }, lineName: "", mine: "Supper", theirs: "Weekly shop" },
    ]);
    expect(outcome.merged.description).toBe("Supper");
  });

  it("is nothing at all when they chose the same value", () => {
    const outcome = mergeExpenseEdit(
      groceries,
      { ...groceries, description: "Weekly shop" },
      { ...groceries, description: "Weekly shop" },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.description).toBe("Weekly shop");
  });

  it("conflicts on a line's price", () => {
    const outcome = mergeExpenseEdit(
      dinner,
      withLine(dinner, "pizza", { totalCents: 2000 + 200 }),
      withLine(dinner, "pizza", { totalCents: 1800 }),
    );

    expect(outcome.conflicts).toEqual([
      { edit: { part: "line", lineId: "pizza" }, lineName: "Pizza", mine: 2200, theirs: 1800 },
    ]);
  });

  it("conflicts on one person's portion of a line", () => {
    const outcome = mergeExpenseEdit(
      dinner,
      withLine(dinner, "pizza", { shares: { [TOMAS]: 2 } }),
      withLine(dinner, "pizza", { shares: { [TOMAS]: 3 } }),
    );

    expect(outcome.conflicts).toEqual([
      { edit: { part: "share", lineId: "pizza", userId: TOMAS }, lineName: "Pizza", mine: 2, theirs: 3 },
    ]);
  });

  it("conflicts when one person removed a line the other changed", () => {
    const removed = mergeExpenseEdit(
      dinner,
      { ...dinner, lines: [dinner.lines[1]] },
      withLine(dinner, "pizza", { totalCents: 1800 }),
    );
    expect(removed.conflicts).toEqual([
      { edit: { part: "line", lineId: "pizza" }, lineName: "Pizza", mine: null, theirs: 1800 },
    ]);

    const changed = mergeExpenseEdit(
      dinner,
      withLine(dinner, "pizza", { totalCents: 1800 }),
      { ...dinner, lines: [dinner.lines[1]] },
    );
    expect(changed.conflicts).toEqual([
      { edit: { part: "line", lineId: "pizza" }, lineName: "Pizza", mine: 1800, theirs: null },
    ]);
  });

  it("conflicts when both moved the money of an expense that is not itemized", () => {
    const outcome = mergeExpenseEdit(
      groceries,
      { ...groceries, amountCents: 9000, owed: { [SARA]: 3000, [TOMAS]: 3000, [PRIYA]: 3000 }, payers: { [SARA]: 9000 } },
      { ...groceries, amountCents: 9600, owed: { [SARA]: 3200, [TOMAS]: 3200, [PRIYA]: 3200 }, payers: { [SARA]: 9600 } },
    );

    expect(outcome.conflicts.map((conflict) => conflict.edit)).toEqual([{ part: "money" }]);
  });

  it("conflicts when one person switched to items and the other changed the amount", () => {
    const outcome = mergeExpenseEdit(
      groceries,
      { ...dinner, description: groceries.description, category: groceries.category },
      { ...groceries, amountCents: 9600, owed: { [SARA]: 3200, [TOMAS]: 3200, [PRIYA]: 3200 }, payers: { [SARA]: 9600 } },
    );

    expect(outcome.conflicts.map((conflict) => conflict.edit)).toEqual([{ part: "money" }]);
  });

  it("conflicts when both changed who paid", () => {
    const outcome = mergeExpenseEdit(
      groceries,
      { ...groceries, payers: { [TOMAS]: 10000 } },
      { ...groceries, payers: { [PRIYA]: 10000 } },
    );

    expect(outcome.conflicts.map((conflict) => conflict.edit)).toEqual([{ part: "payers" }]);
  });
});

describe("reading the same expense on two phones is not a change", () => {
  it("does not take an equal split's odd cent landing on someone else for an edit", () => {
    // Tomas's form lists Tomas first, so his save gives him the odd cent.
    const theirs = { ...groceries, expenseDate: "2026-10-28" };
    const outcome = mergeExpenseEdit(
      groceries,
      { ...groceries, owed: { [TOMAS]: 3334, [SARA]: 3333, [PRIYA]: 3333 }, notes: "Milk" },
      theirs,
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.owed).toEqual(groceries.owed);
    expect(outcome.merged.notes).toBe("Milk");
  });

  it("keeps a percent split as it was when it reopens as the same amounts", () => {
    const percent = { ...groceries, splitType: "percent" };
    const outcome = mergeExpenseEdit(percent, { ...groceries, splitType: "exact", notes: "Milk" }, percent);

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.splitType).toBe("percent");
  });

  it("does not count who paid as changed because the total moved", () => {
    const outcome = mergeExpenseEdit(
      groceries,
      { ...groceries, amountCents: 9000, owed: { [SARA]: 3000, [TOMAS]: 3000, [PRIYA]: 3000 }, payers: { [SARA]: 9000 } },
      { ...groceries, notes: "Milk" },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.theirChanges).toEqual([{ part: "notes" }]);
    expect(outcome.merged.payers).toEqual({ [SARA]: 9000 });
  });
});

describe("money that must still reconcile", () => {
  it("refuses to leave several payers short of a total that moved", () => {
    const shared = { ...dinner, payers: { [SARA]: 1400, [TOMAS]: 1400 } };
    const outcome = mergeExpenseEdit(shared, withLine(shared, "pizza", { totalCents: 1800 }), { ...shared, notes: "Birthday" });

    expect(outcome.conflicts).toEqual([{ edit: { part: "payers" }, lineName: "", mine: 2800, theirs: 2600 }]);
  });

  it("refuses a merge that leaves no bill at all", () => {
    const outcome = mergeExpenseEdit(
      dinner,
      { ...dinner, lines: [dinner.lines[0]] },
      { ...dinner, lines: [dinner.lines[1]], amountCents: 800, owed: { [PRIYA]: 800 }, payers: { [SARA]: 800 } },
    );

    expect(outcome.conflicts.map((conflict) => conflict.edit)).toContainEqual({ part: "money" });
  });

  it("refuses to leave a line with nobody on it when each person took somebody off", () => {
    const shared = withLine(dinner, "pizza", { shares: { [TOMAS]: 1, [PRIYA]: 1 } });
    const outcome = mergeExpenseEdit(
      shared,
      withLine(shared, "pizza", { shares: { [TOMAS]: 1 } }),
      withLine(shared, "pizza", { shares: { [PRIYA]: 1 } }),
    );

    expect(outcome.conflicts.map((conflict) => conflict.edit)).toEqual([{ part: "line", lineId: "pizza" }]);
  });

  it("while a live split runs, leaves such a line with whoever paid", () => {
    const shared = withLine(dinner, "pizza", { shares: { [TOMAS]: 1, [PRIYA]: 1 } });
    const outcome = mergeExpenseEdit(
      shared,
      withLine(shared, "pizza", { shares: { [TOMAS]: 1 } }),
      withLine(shared, "pizza", { shares: { [PRIYA]: 1 } }),
      { live: true },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.lines[0].shares).toEqual({});
    expect(outcome.merged.owed).toEqual({ [SARA]: 2000, [PRIYA]: 800 });
  });

  it("moves unclaimed lines to a new payer", () => {
    const open = withLine(dinner, "pizza", { shares: {} });
    const outcome = mergeExpenseEdit(open, { ...open, payers: { [TOMAS]: 2800 } }, open, { live: true });

    expect(outcome.merged.owed).toEqual({ [TOMAS]: 2000, [PRIYA]: 800 });
  });

  it("while a live split runs, a price fix and a second card both land", () => {
    const open = withLine(dinner, "pizza", { shares: {} });
    const repriced = withLine(open, "pizza", { totalCents: 3000 });
    const secondCard = { ...open, payers: { [SARA]: 2000, [TOMAS]: 800 } };
    const outcome = mergeExpenseEdit(open, repriced, secondCard, { live: true });

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.merged.amountCents).toBe(3800);
    expect(outcome.merged.payers).toEqual({ [SARA]: 2714, [TOMAS]: 1086 });
  });

  it("while a split runs, makes whoever paid follow the total on a bill with no lines too", () => {
    const empty = { ...dinner, splitType: "equal", lines: [], taxCents: 0, tipCents: 0, amountCents: 0, payers: { [SARA]: 0 }, owed: {} };
    const filled = { ...empty, amountCents: 6000, owed: { [SARA]: 3000, [TOMAS]: 3000 } };

    expect(mergeExpenseEdit(empty, filled, empty, { live: true }).merged.payers).toEqual({ [SARA]: 6000 });
  });

  it("sees ticking somebody who joined an even split as moving the money", () => {
    const even = { ...groceries, splitType: "equal", owed: { [SARA]: 4500, [TOMAS]: 4500, [NOOR]: 0 } };
    const shared = { ...even, owed: { [SARA]: 3000, [TOMAS]: 3000, [NOOR]: 3000 } };

    expect(sameMoney(even, shared)).toBe(false);
    expect(mergeExpenseEdit(even, shared, even, { live: true }).merged.owed).toEqual(shared.owed);
  });

  it("outside a live split, leaves somebody at nothing on the bill", () => {
    const exact = { ...groceries, splitType: "exact", owed: { [SARA]: 9000, [TOMAS]: 0 } };

    expect(mergeExpenseEdit(exact, { ...exact, description: "Renamed" }, exact).merged.owed).toEqual({ [SARA]: 9000, [TOMAS]: 0 });
  });

  it("outside a live split, several people's typed amounts stay theirs to change", () => {
    const twoCards = { ...dinner, payers: { [SARA]: 2000, [TOMAS]: 800 } };
    const repriced = withLine(twoCards, "pizza", { totalCents: 3000 });

    expect(mergeExpenseEdit(twoCards, repriced, twoCards).conflicts.map((conflict) => conflict.edit.part)).toContain("payers");
  });
});

describe("an edit that changes nothing", () => {
  it("merges back to the saved expense", () => {
    const outcome = mergeExpenseEdit(dinner, dinner, dinner);

    expect(outcome.conflicts).toEqual([]);
    expect(sameExpense(outcome.merged, dinner)).toBe(true);
  });

  it("is told apart from one that changes a line", () => {
    const outcome = mergeExpenseEdit(dinner, withLine(dinner, "beer", { name: "Lager" }), dinner);

    expect(sameExpense(outcome.merged, dinner)).toBe(false);
  });
});

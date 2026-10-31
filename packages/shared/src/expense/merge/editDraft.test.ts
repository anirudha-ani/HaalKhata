/** An open form catching up with what somebody else saved: nothing typed is lost, and every collision is asked about. */

import { describe, expect, it } from "vitest";
import type { DraftLineItem } from "../form/splitForm";
import { describeEditConflict, describeTheirChanges } from "./describeEdit";
import { adoptDraftLines, catchUpForm, draftExpenseState, editPartKey, takeTheirs, type DraftExpenseFields } from "./editDraft";
import { expenseStateOf, sameExpense, type ExpenseStateSource } from "./expenseState";

const SARA = "user-sara";
const TOMAS = "user-tomas";

/** A dinner as the server sends it. */
const dinner: ExpenseStateSource = {
  description: "Dinner",
  category: "food",
  expenseDate: "2026-10-29",
  notes: "",
  splitType: "itemized",
  amountCents: 2800,
  taxCents: 0,
  tipCents: 0,
  payers: [{ userId: SARA, amountCents: 2800 }],
  splits: [{ userId: TOMAS, owedCents: 2800 }],
  items: [
    { id: "pizza", name: "Pizza", quantity: 1, totalCents: 2000, assignments: [{ userId: TOMAS, weight: 1 }] },
    { id: "beer", name: "Beer", quantity: 1, totalCents: 800, assignments: [{ userId: TOMAS, weight: 1 }] },
  ],
};

/**
 * The form as it opens on that dinner.
 *
 * @param change - Fields to change.
 * @returns The fields.
 */
function openForm(change: Partial<DraftExpenseFields> = {}): DraftExpenseFields {
  return {
    description: "Dinner",
    category: "food",
    date: "2026-10-29",
    notes: "",
    splitType: "itemized",
    totalCents: 2800,
    previewShares: { [TOMAS]: 2800 },
    multiPayer: false,
    singlePayerId: SARA,
    payerAmounts: {},
    items: [
      { key: "a", id: "pizza", name: "Pizza", total: "20.00", quantity: 1, assignees: { [TOMAS]: 1 } },
      { key: "b", id: "beer", name: "Beer", total: "8.00", quantity: 1, assignees: { [TOMAS]: 1 } },
    ],
    taxCents: 0,
    tipCents: 0,
    currency: "USD",
    ...change,
  };
}

describe("a form read as a state", () => {
  it("is the same expense it opened on until somebody changes it", () => {
    expect(sameExpense(draftExpenseState(openForm()), expenseStateOf(dinner))).toBe(true);
  });

  it("does not count stray spaces in the name as a change", () => {
    expect(sameExpense(draftExpenseState(openForm({ description: " Dinner " })), expenseStateOf(dinner))).toBe(true);
  });

  it("sees a changed price", () => {
    const items = openForm().items.map((item) => (item.id === "pizza" ? { ...item, total: "18.00" } : item));
    expect(sameExpense(draftExpenseState(openForm({ items })), expenseStateOf(dinner))).toBe(false);
  });
});

describe("taking merged lines into a form", () => {
  const rows: DraftLineItem[] = [
    { key: "a", id: "pizza", name: "Pizza ", total: "20", quantity: 1, assignees: { [TOMAS]: 1 } },
    { key: "b", name: "Salad", total: "9.00", quantity: 1, assignees: { [SARA]: 1 } },
  ];

  it("keeps a row's key and the text typed into it when it still means the same thing", () => {
    const [pizza] = adoptDraftLines(rows, [{ id: "pizza", name: "Pizza", quantity: 1, totalCents: 2000, shares: { [SARA]: 1 } }], "USD");

    expect(pizza).toEqual({ key: "a", id: "pizza", name: "Pizza ", total: "20", quantity: 1, assignees: { [SARA]: 1 } });
  });

  it("shows the new price when somebody changed it", () => {
    const [pizza] = adoptDraftLines(rows, [{ id: "pizza", name: "Pizza", quantity: 1, totalCents: 1800, shares: {} }], "USD");

    expect(pizza.total).toBe("18.00");
  });

  it("keeps a line this person has not saved yet, and adds one somebody else saved", () => {
    const lines = adoptDraftLines(
      rows,
      [
        { id: "pizza", name: "Pizza", quantity: 1, totalCents: 2000, shares: {} },
        { id: "wine", name: "Wine", quantity: 1, totalCents: 1200, shares: {} },
        { id: "", name: "Salad", quantity: 1, totalCents: 900, shares: { [SARA]: 1 } },
      ],
      "USD",
    );

    expect(lines.map((line) => [line.name, line.id])).toEqual([
      ["Pizza ", "pizza"],
      ["Wine", "wine"],
      ["Salad", undefined],
    ]);
    expect(lines[2].key).toBe("b");
  });
});

describe("catching up with a save", () => {
  it("takes in what this person left alone and says whose change it was", () => {
    const caughtUp = catchUpForm({
      base: dinner,
      form: draftExpenseState(openForm({ notes: "Birthday" })),
      latest: { ...dinner, expenseDate: "2026-10-28" },
      who: "Sara",
      byMe: false,
      held: [],
      live: false,
    });

    expect([...caughtUp.parts]).toEqual(["expenseDate"]);
    expect(caughtUp.note).toBe("Sara changed the date.");
    expect(caughtUp.conflicts).toEqual([]);
  });

  it("says nothing about a person's own save from another device", () => {
    const caughtUp = catchUpForm({
      base: dinner,
      form: draftExpenseState(openForm()),
      latest: { ...dinner, expenseDate: "2026-10-28" },
      who: "Sara",
      byMe: true,
      held: [],
      live: false,
    });

    expect(caughtUp.note).toBe("");
    expect([...caughtUp.parts]).toEqual(["expenseDate"]);
  });

  it("holds on to an earlier conflict still waiting for an answer", () => {
    const first = catchUpForm({
      base: dinner,
      form: draftExpenseState(openForm({ description: "Supper" })),
      latest: { ...dinner, description: "Tea" },
      who: "Sara",
      byMe: false,
      held: [],
      live: false,
    });
    const second = catchUpForm({
      base: { ...dinner, description: "Tea" },
      form: draftExpenseState(openForm({ description: "Supper" })),
      latest: { ...dinner, description: "Tea", notes: "Birthday" },
      who: "Sara",
      byMe: false,
      held: first.conflicts,
      live: false,
    });

    expect(second.conflicts.map((conflict) => editPartKey(conflict.edit))).toEqual(["description"]);
  });
});

describe("catching up during a live split", () => {
  const unclaimed = {
    ...dinner,
    items: [
      { id: "pizza", name: "Pizza", quantity: 1, totalCents: 2000, assignments: [] },
      { id: "beer", name: "Beer", quantity: 1, totalCents: 800, assignments: [] },
    ],
    amountCents: 2800,
    taxCents: 0,
    tipCents: 0,
    splits: [{ userId: SARA, owedCents: 2800 }],
    payers: [{ userId: SARA, amountCents: 2800 }],
  };
  const beerClaimed = {
    ...unclaimed,
    items: [unclaimed.items[0], { ...unclaimed.items[1], assignments: [{ userId: TOMAS, weight: 1 }] }],
    splits: [{ userId: SARA, owedCents: 2000 }, { userId: TOMAS, owedCents: 800 }],
  };

  it("asks nothing about a line nobody has claimed yet", () => {
    const form = { ...expenseStateOf(unclaimed) };
    const caughtUp = catchUpForm({ base: unclaimed, form, latest: beerClaimed, who: "Tomas", byMe: false, held: [], live: true });
    expect(caughtUp.conflicts).toEqual([]);
  });

  it("asks nothing when somebody joins with nothing to pay", () => {
    const form = { ...expenseStateOf(dinner), amountCents: 9000 };
    const latest = { ...dinner, splits: [...dinner.splits, { userId: "user-noor", owedCents: 0 }] };
    const caughtUp = catchUpForm({ base: dinner, form, latest, who: "Noor", byMe: false, held: [], live: true });
    expect(caughtUp.conflicts).toEqual([]);
  });
});

describe("catching up once a live split has ended", () => {
  const unclaimed = {
    ...dinner,
    splits: [{ userId: SARA, owedCents: 2800 }],
    items: dinner.items.map((item) => ({ ...item, assignments: [] })),
  };
  const ended = { ...unclaimed, items: unclaimed.items.map((item) => ({ ...item, assignments: [{ userId: SARA, weight: 1 }] })) };

  it("keeps a claim this person had not saved, and asks nothing", () => {
    const form = {
      ...expenseStateOf(unclaimed),
      lines: expenseStateOf(unclaimed).lines.map((line) => (line.id === "beer" ? { ...line, shares: { [TOMAS]: 1 } } : line)),
    };

    const caughtUp = catchUpForm({ base: unclaimed, form, latest: ended, who: "Sara", byMe: false, held: [], live: false });

    expect(caughtUp.conflicts).toEqual([]);
    expect(caughtUp.merged.lines.find((line) => line.id === "beer")?.shares).toEqual({ [TOMAS]: 1 });
    expect(caughtUp.merged.lines.find((line) => line.id === "pizza")?.shares).toEqual({ [SARA]: 1 });
  });
});

describe("answering a conflict with the saved value", () => {
  const theirs = expenseStateOf({
    ...dinner,
    items: [{ ...dinner.items[0], totalCents: 1800 }, dinner.items[1]],
  });
  const mine = expenseStateOf(dinner);

  it("takes a line's details and leaves who is on it", () => {
    const form = { ...mine, lines: mine.lines.map((line) => (line.id === "pizza" ? { ...line, shares: { [SARA]: 1 } } : line)) };

    const taken = takeTheirs(form, theirs, { part: "line", lineId: "pizza" });

    expect(taken.lines[0]).toMatchObject({ totalCents: 1800, shares: { [SARA]: 1 } });
  });

  it("puts back a line this person removed", () => {
    const form = { ...mine, lines: [mine.lines[1]] };

    expect(takeTheirs(form, theirs, { part: "line", lineId: "pizza" }).lines.map((line) => line.id)).toContain("pizza");
  });

  it("removes a line somebody else removed", () => {
    const gone = { ...theirs, lines: [theirs.lines[1]] };

    expect(takeTheirs(mine, gone, { part: "line", lineId: "pizza" }).lines.map((line) => line.id)).toEqual(["beer"]);
  });

  it("takes one person's portion", () => {
    const saved = { ...mine, lines: mine.lines.map((line) => ({ ...line, shares: { [TOMAS]: 3 } })) };

    expect(takeTheirs(mine, saved, { part: "share", lineId: "beer", userId: TOMAS }).lines[1].shares[TOMAS]).toBe(3);
  });

  it("takes a plain field", () => {
    expect(takeTheirs(mine, { ...mine, notes: "Birthday" }, { part: "notes" }).notes).toBe("Birthday");
  });
});

describe("the words", () => {
  const wording = { who: "Sara", currency: "USD", nameOf: () => "Tomas" };

  it("names both values of a line's price", () => {
    expect(describeEditConflict(
      { edit: { part: "line", lineId: "pizza" }, lineName: "Pizza", mine: 2000, theirs: 1800 },
      wording,
    )).toBe("Sara set Pizza to $18.00. You have $20.00.");
  });

  it("says who removed what", () => {
    const line = { edit: { part: "line", lineId: "pizza" }, lineName: "Pizza" } as const;

    expect(describeEditConflict({ ...line, mine: 2000, theirs: null }, wording)).toBe("Sara removed Pizza, and you changed it.");
    expect(describeEditConflict({ ...line, mine: null, theirs: 1800 }, wording)).toBe("You removed Pizza, and Sara changed it.");
  });

  it("names the person whose portion it is", () => {
    expect(describeEditConflict(
      { edit: { part: "share", lineId: "pizza", userId: TOMAS }, lineName: "Pizza", mine: 2, theirs: 3 },
      wording,
    )).toBe("Sara set Tomas’s portion of Pizza to 3. You have 2.");
  });

  it("lists up to three changes, then stops", () => {
    const latest = expenseStateOf(dinner);

    expect(describeTheirChanges([{ part: "expenseDate" }, { part: "line", lineId: "pizza" }], latest, "Sara"))
      .toBe("Sara changed the date and Pizza.");
    expect(describeTheirChanges(
      [{ part: "expenseDate" }, { part: "notes" }, { part: "category" }, { part: "tipCents" }],
      latest,
      "Sara",
    )).toBe("Sara changed the date, the notes, the category and more.");
  });
});

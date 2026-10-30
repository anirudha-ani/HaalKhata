/** A tap on a live split changes the bill exactly, and says the same thing if it is sent twice. */

import { describe, expect, it } from "vitest";
import type { ExpenseState } from "../merge/expenseState";
import {
  addLine,
  lineShareCents,
  liveEditRequest,
  liveSummary,
  liveTimeLeft,
  liveTotal,
  removeLine,
  setLineDetails,
  setOnLine,
  setTaxAndTip,
  withSavedEdit,
} from "./liveEdits";

const SARA = "user-sara";
const TOMAS = "user-tomas";
const PRIYA = "user-priya";

/** A bill Sara paid, with nobody on any line. */
const bill: ExpenseState = {
  description: "Dinner",
  category: "food",
  expenseDate: "2026-10-30",
  notes: "",
  splitType: "itemized",
  amountCents: 2800,
  owed: { [SARA]: 2800 },
  payers: { [SARA]: 2800 },
  lines: [
    { id: "pizza", name: "Pizza", quantity: 1, totalCents: 2000, shares: {} },
    { id: "beer", name: "Beer", quantity: 1, totalCents: 800, shares: {} },
  ],
  taxCents: 0,
  tipCents: 0,
};

describe("claiming a line", () => {
  it("moves it from whoever paid to whoever claimed it", () => {
    const claimed = setOnLine("pizza", TOMAS, true)(bill);

    expect(claimed.owed).toEqual({ [TOMAS]: 2000, [SARA]: 800 });
    expect(claimed.amountCents).toBe(2800);
  });

  it("shares a line between everyone on it", () => {
    const shared = setOnLine("pizza", PRIYA, true)(setOnLine("pizza", TOMAS, true)(bill));

    expect(shared.owed).toEqual({ [TOMAS]: 1000, [PRIYA]: 1000, [SARA]: 800 });
  });

  it("says the same thing when it is sent twice", () => {
    const once = setOnLine("pizza", TOMAS, true)(bill);

    expect(setOnLine("pizza", TOMAS, true)(once)).toEqual(once);
  });

  it("gives a line back when the last person leaves it", () => {
    const back = setOnLine("pizza", TOMAS, false)(setOnLine("pizza", TOMAS, true)(bill));

    expect(back.lines[0].shares).toEqual({});
    expect(back.owed).toEqual({ [SARA]: 2800 });
  });
});

describe("fixing the receipt", () => {
  it("keeps the total and who paid in step with a corrected price", () => {
    const fixed = setLineDetails("pizza", { name: "Pizza", totalCents: 1800 })(bill);

    expect(fixed.amountCents).toBe(2600);
    expect(fixed.payers).toEqual({ [SARA]: 2600 });
  });

  it("adds a line nobody is on, with no id until it is saved", () => {
    const added = addLine({ name: "Water", totalCents: 300 })(bill);

    expect(added.lines[2]).toEqual({ id: "", name: "Water", quantity: 1, totalCents: 300, shares: {} });
    expect(added.amountCents).toBe(3100);
  });

  it("removes a line", () => {
    expect(removeLine("beer")(bill).amountCents).toBe(2000);
  });

  it("spreads tax and tip over what people claimed", () => {
    const taxed = setTaxAndTip({ taxCents: 280, tipCents: 0 })(setOnLine("pizza", TOMAS, true)(bill));

    expect(taxed.amountCents).toBe(3080);
    expect(taxed.owed).toEqual({ [TOMAS]: 2200, [SARA]: 880 });
  });
});

describe("what it comes to", () => {
  it("says what this person owes and what nobody has claimed", () => {
    const claimed = setOnLine("pizza", TOMAS, true)(bill);

    expect(liveSummary(claimed, TOMAS)).toEqual({ payerId: SARA, myShareCents: 2000, unclaimedCents: 800, unclaimedLines: 1 });
  });

  it("names nobody as the payer when several people paid", () => {
    expect(liveSummary({ ...bill, payers: { [SARA]: 1400, [TOMAS]: 1400 } }, SARA).payerId).toBe("");
  });

  it("gives this person's part of a shared line, by the same rounding as the bill", () => {
    const line = { ...bill.lines[0], totalCents: 1000, shares: { [SARA]: 1, [TOMAS]: 1, [PRIYA]: 1 } };
    const parts = [SARA, TOMAS, PRIYA].map((userId) => lineShareCents(line, userId) ?? 0);

    expect(parts.reduce((running, cents) => running + cents, 0)).toBe(1000);
    expect(lineShareCents(bill.lines[0], SARA)).toBeNull();
  });

  it("says how long is left, and nothing once it is over", () => {
    const clock = Date.parse("2026-10-30T20:00:00Z");

    expect(liveTimeLeft("2026-10-30T20:22:30Z", clock)).toBe("23 min left");
    expect(liveTimeLeft("2026-10-30T20:00:20Z", clock)).toBe("Under a minute left");
    expect(liveTimeLeft("2026-10-30T19:59:00Z", clock)).toBe("");
  });
});

describe("the request that saves it", () => {
  it("carries each line's id and everybody on it", () => {
    const request = liveEditRequest({ groupId: "flat", currency: "USD" }, setOnLine("pizza", TOMAS, true)(bill), "attempt-1");

    expect(request).toMatchObject({
      groupId: "flat",
      currency: "USD",
      splitType: "itemized",
      amountCents: 2800,
      payers: [{ userId: SARA, amountCents: 2800 }],
      operationId: "attempt-1",
    });
    expect(request.items[0]).toEqual({
      id: "pizza",
      name: "Pizza",
      quantity: 1,
      totalCents: 2000,
      assignments: [{ userId: TOMAS, weight: 1 }],
    });
  });
});

describe("the headline figure", () => {
  /** A $37 bill Sara paid, with $8 of it Tomas's. */
  const bill = { amountCents: 3700, payers: { sara: 3700 }, owed: { sara: 2900, tomas: 800 }, lines: [] } as unknown as ExpenseState;

  it("gives somebody their share of the bill, and a way to settle", () => {
    expect(liveTotal(bill, "tomas", false)).toEqual({ label: "Your share", cents: 800, owing: true });
  });

  it("tells somebody who has paid that it is done", () => {
    expect(liveTotal(bill, "tomas", true)).toEqual({ label: "Your share, settled", cents: 800, owing: false });
  });

  it("does not call an empty share settled", () => {
    expect(liveTotal({ ...bill, owed: { sara: 3700 } }, "tomas", true)).toEqual({ label: "Your share", cents: 0, owing: true });
  });

  it("gives whoever paid a figure that stays true as people pay them back", () => {
    expect(liveTotal(bill, "sara", false)).toEqual({ label: "Others' shares", cents: 800, owing: false });
    expect(liveTotal(bill, "sara", true)).toEqual({ label: "Everyone has settled", cents: 800, owing: false });
  });

  it("says nothing about settling while whoever paid has it all to themselves", () => {
    expect(liveTotal({ ...bill, owed: { sara: 3700 } }, "sara", true).label).toBe("Others' shares");
  });
});

describe("what a device holds after a tap saves", () => {
  const held = { expense: { version: 4 }, settledForViewer: true };

  it("no longer takes it as settled: a tap can leave somebody owing", () => {
    expect(withSavedEdit(held, { version: 5 })).toEqual({ expense: { version: 5 }, settledForViewer: false });
  });

  it("keeps a newer copy that arrived first", () => {
    expect(withSavedEdit(held, { version: 3 })).toBe(held);
  });

  it("holds nothing if it held nothing", () => {
    expect(withSavedEdit(undefined, { version: 5 })).toBeUndefined();
  });
});

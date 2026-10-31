/** A tap on a live split changes the bill exactly, and says the same thing if it is sent twice. */

import { describe, expect, it } from "vitest";
import type { ExpenseState } from "../merge/expenseState";
import {
  addLine,
  billDebts,
  checkPaidAmount,
  lineShareCents,
  liveEditRequest,
  liveSummary,
  livePayers,
  liveTimeLeft,
  liveTotal,
  removeLine,
  setLineDetails,
  setOnLine,
  setPaid,
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

describe("several people paying", () => {
  it("lets somebody add their own card, and that alone puts nobody in debt", () => {
    const carded = setPaid(TOMAS, 1200)(bill);

    expect(carded.payers).toEqual({ [SARA]: 1600, [TOMAS]: 1200 });
    expect(carded.owed).toEqual({ [SARA]: 1600, [TOMAS]: 1200 });
    expect(livePayers(carded, TOMAS).map((payer) => payer.owedCents)).toEqual([0, 0]);
  });

  it("keeps everyone's proportions when the bill grows", () => {
    const grown = setTaxAndTip({ taxCents: 0, tipCents: 700 })(setPaid(TOMAS, 1400)(bill));

    expect(grown.amountCents).toBe(3500);
    expect(grown.payers).toEqual({ [SARA]: 1750, [TOMAS]: 1750 });
  });

  it("still adds up when the bill shrinks below what somebody typed", () => {
    const shrunk = removeLine("pizza")(setPaid(TOMAS, 2000)(bill));

    expect(shrunk.amountCents).toBe(800);
    expect(Object.values(shrunk.payers).reduce((running, cents) => running + cents, 0)).toBe(800);
  });

  it("lets somebody take over the whole bill when it was never who it said", () => {
    expect(setPaid(TOMAS, 2800)(bill).payers).toEqual({ [TOMAS]: 2800 });
  });

  it("holds to the bill if it shrank after somebody typed", () => {
    expect(setPaid(TOMAS, 9999)(bill).payers).toEqual({ [TOMAS]: 2800 });
  });

  it("takes a payer off, and whoever is left covers it", () => {
    expect(setPaid(TOMAS, 0)(setPaid(TOMAS, 1200)(bill)).payers).toEqual({ [SARA]: 2800 });
  });

  it("keeps the last payer: somebody has to have paid", () => {
    expect(setPaid(SARA, 0)(bill).payers).toEqual({ [SARA]: 2800 });
  });

  it("gives a line's unclaimed part to those who paid, and a claim sends the debt to them", () => {
    const claimed = setOnLine("beer", PRIYA, true)(setPaid(TOMAS, 1200)(bill));
    const rows = livePayers(claimed, PRIYA);

    expect(rows.map((payer) => payer.userId)).toEqual([SARA, TOMAS]);
    expect(rows.map((payer) => payer.owedCents)).toEqual([457, 343]);
  });

  it("does not offer somebody a debt to themselves", () => {
    const claimed = setOnLine("pizza", TOMAS, true)(setPaid(TOMAS, 1200)(bill));

    expect(livePayers(claimed, TOMAS).find((payer) => payer.userId === TOMAS)?.owedCents).toBe(0);
    expect(livePayers(claimed, TOMAS).find((payer) => payer.userId === SARA)?.owedCents).toBe(1143);
  });
});

describe("when the balance is worth reading", () => {
  const twoCards = setOnLine("pizza", PRIYA, true)(setPaid(TOMAS, 1200)(bill));

  it("not for somebody who owes nothing on the bill", () => {
    expect(billDebts(bill, TOMAS)).toEqual({ payerIds: [], key: "" });
  });

  it("not for whoever paid", () => {
    expect(billDebts(twoCards, SARA).key).toBe("");
  });

  it("for somebody who owes, naming who", () => {
    expect(billDebts(twoCards, PRIYA).payerIds).toEqual([SARA, TOMAS]);
  });

  it("not again when somebody else's tap leaves this person's debt alone", () => {
    const opened = setOnLine("pizza", PRIYA, true)(bill);
    const afterAnotherTap = setOnLine("beer", TOMAS, true)(opened);

    expect(billDebts(afterAnotherTap, PRIYA).key).toBe(billDebts(opened, PRIYA).key);
  });

  it("again when somebody else's tap changes which of several payers this person owes", () => {
    const opened = setOnLine("pizza", PRIYA, true)(setPaid(TOMAS, 1200)(bill));
    const afterAnotherTap = setOnLine("beer", SARA, true)(opened);

    expect(billDebts(afterAnotherTap, PRIYA).key).not.toBe(billDebts(opened, PRIYA).key);
  });

  it("again when this person's own debt moves", () => {
    expect(billDebts(setOnLine("beer", PRIYA, true)(twoCards), PRIYA).key).not.toBe(billDebts(twoCards, PRIYA).key);
  });
});

describe("what somebody says they paid", () => {
  it("takes an amount within the bill", () => {
    expect(checkPaidAmount("12.00", bill, "USD")).toEqual({ cents: 1200, message: "" });
  });

  it("says nothing yet about an empty field", () => {
    expect(checkPaidAmount("  ", bill, "USD")).toEqual({ cents: 0, message: "" });
  });

  it("says when it is more than the bill", () => {
    expect(checkPaidAmount("30.00", bill, "USD").message).toContain("$28.00");
  });

  it("says when it is not an amount", () => {
    expect(checkPaidAmount("lots", bill, "USD").message).toBe("Enter how much was paid.");
  });
});

describe("what it comes to", () => {
  it("says what this person owes and what nobody has claimed", () => {
    const claimed = setOnLine("pizza", TOMAS, true)(bill);

    expect(liveSummary(claimed, TOMAS)).toEqual({ myShareCents: 2000, myPaidCents: 0, unclaimedCents: 800, unclaimedLines: 1 });
  });

  it("says what this person paid", () => {
    expect(liveSummary(setPaid(TOMAS, 1200)(bill), TOMAS).myPaidCents).toBe(1200);
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
  const owing = { settledForViewer: false, owedUserIds: ["sara"] };
  const paidEveryone = { settledForViewer: true, owedUserIds: [] };

  /** A $37 bill Sara paid, with $8 of it Tomas's. */
  const bill = { amountCents: 3700, payers: { sara: 3700 }, owed: { sara: 2900, tomas: 800 }, lines: [] } as unknown as ExpenseState;

  it("gives somebody their share of the bill, and a way to settle", () => {
    expect(liveTotal(bill, "tomas", owing)).toEqual({ label: "Your share", cents: 800, owing: true });
  });

  it("tells somebody who has paid that it is done", () => {
    expect(liveTotal(bill, "tomas", paidEveryone)).toEqual({ label: "Your share, settled", cents: 800, owing: false });
  });

  it("does not let somebody else's debt to this person hide that they have paid", () => {
    const owedByPriya = { settledForViewer: false, owedUserIds: [] };

    expect(liveTotal(bill, "tomas", owedByPriya).label).toBe("Your share, settled");
  });

  it("does not call an empty share settled", () => {
    expect(liveTotal({ ...bill, owed: { sara: 3700 } }, "tomas", paidEveryone)).toEqual({ label: "Your share", cents: 0, owing: false });
  });

  it("gives whoever paid a figure that stays true as people pay them back", () => {
    expect(liveTotal(bill, "sara", { settledForViewer: false, owedUserIds: [] })).toEqual({ label: "You covered for others", cents: 800, owing: false });
    expect(liveTotal(bill, "sara", paidEveryone)).toEqual({ label: "Everyone has settled", cents: 800, owing: false });
  });

  it("gives whoever paid their share until somebody else has some of it", () => {
    expect(liveTotal({ ...bill, owed: { sara: 3700 } }, "sara", paidEveryone)).toEqual({ label: "Your share", cents: 3700, owing: false });
  });

  it("counts only what a second payer put in beyond their own share", () => {
    const twoCards = { ...bill, payers: { sara: 2700, tomas: 1000 }, owed: { sara: 2900, tomas: 800 } };

    expect(liveTotal(twoCards, "tomas", owing)).toEqual({ label: "You covered for others", cents: 200, owing: false });
  });

  it("gives somebody who paid less than their share that share", () => {
    const twoCards = { ...bill, payers: { sara: 3500, tomas: 200 }, owed: { sara: 2900, tomas: 800 } };

    expect(liveTotal(twoCards, "tomas", owing)).toEqual({ label: "Your share", cents: 800, owing: true });
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

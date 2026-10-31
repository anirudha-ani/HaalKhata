/** Regression coverage for useful iOS payment copy: actor, direction, amount, scopes and net outcome. */

import { describe, expect, it } from "vitest";
import { formatMoney } from "@haalkhata/shared/money/money";
import { buildPushMessage } from "@/server/push/usecase/dispatch/pushMessage";
import { settlementLocation, settlementNotification } from "./settlementNotification";

const GROUPS = new Map([
  ["goa", { name: "Goa trip" }],
  ["home", { name: "Flat 4B" }],
]);

describe("payment notification context", () => {
  it("names a single group even when several rows belong to it", () => {
    expect(settlementLocation([{ group_id: "goa" }, { group_id: "goa" }], GROUPS)).toBe("Goa trip");
  });

  it("counts distinct groups and includes one-off balances in a net settlement", () => {
    expect(settlementLocation([
      { group_id: "goa" }, { group_id: "home" }, { group_id: "goa" }, { group_id: null },
    ], GROUPS)).toBe("2 groups + One-off expenses");
  });

  it("does not pretend a missing group name means a one-off payment", () => {
    expect(settlementLocation([{ group_id: "missing" }], GROUPS)).toBe("1 group");
  });
});

describe("payment notifications on iOS", () => {
  it("keeps the screenshot's long name out of the action and amount", () => {
    const words = settlementNotification({
      actorName: "Radhika Mehrotra", amountCents: 2500, currency: "USD",
      paidByReader: false, location: "Goa trip",
    });
    const message = buildPushMessage({
      ...words, type: "settlement", notificationId: "notice-1", actorId: "radhika",
      link: "/groups/goa", expenseGroupId: null,
    }, "reader", "ExponentPushToken[localdevelopmenttoken]", 1);
    expect(message).toMatchObject({
      title: "Radhika Mehrotra",
      body: `Recorded ${formatMoney(2500, "USD")} to you · Goa trip`,
      threadId: "group-goa",
      data: { notificationId: "notice-1", link: "/groups/goa", recipientId: "reader" },
    });
    expect(message.body).not.toContain("…");
  });

  it("says from you when the other person recorded receiving the reader's payment", () => {
    expect(settlementNotification({
      actorName: "Radhika Mehrotra", amountCents: 2500, currency: "USD",
      paidByReader: true, location: "One-off expenses",
    })).toEqual({
      title: "Radhika Mehrotra",
      body: `Recorded ${formatMoney(2500, "USD")} from you · One-off expenses`,
    });
  });

  it("keeps payment direction readable even when the name and group are unusually long", () => {
    const words = settlementNotification({
      actorName: "👩🏽‍🍳".repeat(20), amountCents: 12345, currency: "JPY",
      paidByReader: false, location: "Weekend away ".repeat(10),
    });
    expect(words.title).toBe("👩🏽‍🍳".repeat(20));
    expect(words.body.startsWith(`Recorded ${formatMoney(12345, "JPY")} to you · `)).toBe(true);
  });

  it("puts the remaining balance before the explanation of offsets", () => {
    const words = settlementNotification({
      actorName: "Radhika", amountCents: 600, currency: "USD", paidByReader: false,
      location: "2 groups + One-off expenses", remainingCents: 669, cancelledCents: 21108,
    });
    expect(words.body).toBe(
      `Recorded ${formatMoney(600, "USD")} to you · 2 groups + One-off expenses · They still owe you ${formatMoney(669, "USD")} · ${formatMoney(21108, "USD")} cancelled each way`,
    );
    expect(words.body).not.toContain("Settled up");
  });

  it("limits settled-up wording to the payment's currency", () => {
    expect(settlementNotification({
      actorName: "Radhika", amountCents: 1269, currency: "USD", paidByReader: true,
      location: "Goa trip", remainingCents: 0,
    }).body).toBe(`Recorded ${formatMoney(1269, "USD")} from you · Goa trip · Settled up in USD`);
  });

  it("distinguishes a removed payment from balances that are owed again", () => {
    expect(settlementNotification({
      actorName: "Radhika", amountCents: 600, currency: "USD", paidByReader: true,
      location: "Goa trip", removed: true, cancelledCents: 21108,
    }).body).toBe(
      `Removed ${formatMoney(600, "USD")} payment from you · Goa trip · Balances restored · ${formatMoney(21108, "USD")} owed again each way`,
    );
  });
});

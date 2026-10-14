/** Unit tests for reading a settle position for display. */

import { describe, expect, it } from "vitest";
import {
  readSettlePositions,
  scopeLabel,
  settleOverLimitMessage,
  settleScopeRows,
} from "./settlePosition";

// The reported dollar position, from the reader's side: 223.77 owed outside
// groups, 195.51 and 15.57 owed back inside two.
const dollars = [
  { groupId: "catskills", groupName: "Catskills weekend", netCents: 19551 },
  { groupId: "", groupName: "", netCents: -22377 },
  { groupId: "reunion", groupName: "Reunion weekend", netCents: 1557 },
];

describe("settleScopeRows", () => {
  it("lists the direct slate first, then the largest balance", () => {
    expect(settleScopeRows(dollars)).toEqual([
      { scopeId: "", label: "Not in any group", netCents: -22377, simplified: false },
      { scopeId: "catskills", label: "Catskills weekend", netCents: 19551, simplified: false },
      { scopeId: "reunion", label: "Reunion weekend", netCents: 1557, simplified: false },
    ]);
  });

  it("drops settled balances and names a group that has no name", () => {
    expect(
      settleScopeRows([
        { groupId: "done", groupName: "Old trip", netCents: 0 },
        { groupId: "grp", groupName: "", netCents: 250 },
      ]),
    ).toEqual([{ scopeId: "grp", label: "Unnamed group", netCents: 250, simplified: false }]);
  });
});

describe("readSettlePositions", () => {
  // Dollars point both ways and net to 12.69 owed; euros are owed back in one
  // group; pounds cancel exactly, 50.00 each way.
  const positions = [
    { currency: "EUR", netCents: 7599, digest: "euro-digest", scopes: [{ groupId: "lisbon", groupName: "Lisbon", netCents: 7599 }] },
    {
      currency: "GBP",
      netCents: 0,
      digest: "pound-digest",
      scopes: [
        { groupId: "", groupName: "", netCents: -5000 },
        { groupId: "london", groupName: "London", netCents: 5000 },
      ],
    },
    { currency: "USD", netCents: -1269, digest: "dollar-digest", scopes: dollars },
  ];

  it("opened for a person, settles every balance in the currency on their net", () => {
    const reading = readSettlePositions(positions, "USD");
    expect(reading.everything).toBe(true);
    expect(reading.netCents).toBe(-1269);
    expect(reading.rows.map((shown) => `${shown.label} ${shown.netCents}`)).toEqual([
      "Not in any group -22377",
      "Catskills weekend 19551",
      "Reunion weekend 1557",
    ]);
    expect(reading.digest).toBe("dollar-digest");
  });

  it("opened for a person, offers only currencies with something to pay", () => {
    // Pounds cancel exactly: nothing changes hands, so there is no payment to record.
    expect(readSettlePositions(positions, "USD").currencies).toEqual(["EUR", "USD"]);
    const pounds = readSettlePositions(positions, "GBP");
    expect(pounds.rows).toEqual([]);
    expect(pounds.netCents).toBe(0);
  });

  it("opened for one group, settles that group's balance and nothing else", () => {
    const reading = readSettlePositions(positions, "USD", "catskills");
    expect(reading.everything).toBe(false);
    expect(reading.rows.map((shown) => `${shown.label} ${shown.netCents}`)).toEqual(["Catskills weekend 19551"]);
    // The other way round from the pair's net: in this group the reader is owed.
    expect(reading.netCents).toBe(19551);
    expect(reading.digest).toBe("");
    expect(reading.currencies).toEqual(["USD"]);
  });

  it("opened for what is not in any group, settles that alone, in each currency it holds", () => {
    const reading = readSettlePositions(positions, "USD", "");
    expect(reading.rows.map((shown) => `${shown.label} ${shown.netCents}`)).toEqual(["Not in any group -22377"]);
    expect(reading.netCents).toBe(-22377);
    // Balances that cancel overall can still each be settled on their own.
    expect(reading.currencies).toEqual(["GBP", "USD"]);
    expect(readSettlePositions(positions, "GBP", "").netCents).toBe(-5000);
    expect(readSettlePositions(positions, "GBP", "london").netCents).toBe(5000);
  });

  it("has nothing to settle for a balance that is not there", () => {
    const reading = readSettlePositions(positions, "USD", "lisbon");
    expect(reading.rows).toEqual([]);
    expect(reading.netCents).toBe(0);
    expect(reading.currencies).toEqual(["EUR"]);
    expect(readSettlePositions([], "USD").currencies).toEqual([]);
  });

  it("carries whether a group's balance is a rerouted one", () => {
    const simplified = [{ currency: "USD", netCents: 900, digest: "", scopes: [{ groupId: "flat", groupName: "Flat 4B", netCents: 900, simplified: true }] }];
    expect(readSettlePositions(simplified, "USD").rows[0].simplified).toBe(true);
    expect(readSettlePositions(positions, "USD").rows.every((shown) => !shown.simplified)).toBe(true);
  });
});

describe("settleOverLimitMessage", () => {
  const positions = [{ currency: "USD", netCents: -1269, digest: "", scopes: dollars }];

  it("names the net when everything is being settled", () => {
    expect(settleOverLimitMessage(readSettlePositions(positions, "USD"), "USD", "Sam")).toBe(
      "that's more than the $12.69 you owe overall",
    );
  });

  it("names the one balance when only that is being settled", () => {
    expect(settleOverLimitMessage(readSettlePositions(positions, "USD", "catskills"), "USD", "Sam")).toBe(
      "that's more than the $195.51 Sam owes you in Catskills weekend",
    );
    expect(settleOverLimitMessage(readSettlePositions(positions, "USD", ""), "USD", "Sam")).toBe(
      "that's more than the $223.77 you owe outside groups",
    );
  });
});

describe("scopeLabel", () => {
  it("gives a balance the same name everywhere", () => {
    expect(scopeLabel("", "")).toBe("Not in any group");
    expect(scopeLabel("grp", "Flat 4B")).toBe("Flat 4B");
    expect(scopeLabel("grp", "")).toBe("Unnamed group");
  });
});

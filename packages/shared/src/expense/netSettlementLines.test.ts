/** Unit tests for the wording of a net settlement's statement lines. */

import { describe, expect, it } from "vitest";
import { cancelledEachWayCents, netSettlementTag } from "./netSettlementLines";

const line = (
  netSettlementId: string,
  offset: boolean,
  deltaCents: number,
  deleted = false,
) => ({ netSettlementId, offset, deleted, deltaCents, currency: "USD" });

// One payment of 12.69 that cancelled 211.08 each way: the reader owed that
// much outside groups and was owed it back across two groups.
const payment = line("unit", false, 1269);
const statement = [
  payment,
  line("unit", true, 21108),
  line("unit", true, -19551),
  line("unit", true, -1557),
  // An ordinary payment and an expense share the statement.
  line("", false, 500),
  line("", false, -2500),
];

describe("cancelledEachWayCents", () => {
  it("is one side of the cancelled lines, not both added together", () => {
    expect(cancelledEachWayCents(statement, "unit")).toBe(21108);
  });

  it("reads the same from the other person's side, where every sign is flipped", () => {
    const mirrored = statement.map((entry) => ({ ...entry, deltaCents: -entry.deltaCents }));
    expect(cancelledEachWayCents(mirrored, "unit")).toBe(21108);
  });

  it("counts only the settlement asked about", () => {
    const other = [...statement, line("other", true, 900), line("other", true, -900)];
    expect(cancelledEachWayCents(other, "unit")).toBe(21108);
    expect(cancelledEachWayCents(other, "other")).toBe(900);
  });

  it("is zero when the cancelled lines are not in view", () => {
    expect(cancelledEachWayCents([payment], "unit")).toBe(0);
  });
});

describe("netSettlementTag", () => {
  it("says no money moved on a cancelled balance", () => {
    expect(netSettlementTag(statement[1], statement)).toBe("no money moved");
    expect(netSettlementTag(statement[2], statement)).toBe("no money moved");
  });

  it("says on the payment what it cancelled besides", () => {
    expect(netSettlementTag(payment, statement)).toBe("also cancelled $211.08 owed each way");
  });

  it("still says the payment cancelled something when the amounts are cut off", () => {
    expect(netSettlementTag(payment, [payment])).toBe("also cancelled what you owed each other");
  });

  it("tags nothing outside a net settlement, and nothing that was removed", () => {
    expect(netSettlementTag(statement[4], statement)).toBe("");
    expect(netSettlementTag(line("unit", false, 0, true), statement)).toBe("");
    expect(netSettlementTag(line("unit", true, 0, true), statement)).toBe("");
  });
});

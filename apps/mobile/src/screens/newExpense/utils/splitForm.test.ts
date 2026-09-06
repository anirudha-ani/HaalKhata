/** Unit tests for the expense-form split/payer validation and payload assembly. */

import { describe, expect, it } from "vitest";
import { buildSplitSpecs, checkPayers, checkSplit } from "./splitForm";

const participants = ["user-a", "user-b", "user-c"];

describe("checkSplit", () => {
  it("requires participants and a valid total", () => {
    expect(checkSplit({ currency: "USD", splitType: "equal", totalCents: 900, participantIds: [], inputs: {} }).ok).toBe(false);
    expect(checkSplit({ currency: "USD", splitType: "equal", totalCents: null, participantIds: participants, inputs: {} }).ok).toBe(false);
    expect(checkSplit({ currency: "USD", splitType: "equal", totalCents: 900, participantIds: participants, inputs: {} }).ok).toBe(true);
  });

  it("requires exact amounts to sum to the total", () => {
    const inputs = { "user-a": "3.00", "user-b": "3.00", "user-c": "2.99" };
    expect(checkSplit({ currency: "USD", splitType: "exact", totalCents: 900, participantIds: participants, inputs }).ok).toBe(false);
    expect(
      checkSplit({
        currency: "USD",
        splitType: "exact",
        totalCents: 900,
        participantIds: participants,
        inputs: { ...inputs, "user-c": "3.00" },
      }).ok,
    ).toBe(true);
  });

  it("requires percentages to sum to 100", () => {
    const inputs = { "user-a": "33.3", "user-b": "33.3", "user-c": "33.3" };
    expect(checkSplit({ currency: "USD", splitType: "percent", totalCents: 900, participantIds: participants, inputs }).ok).toBe(false);
    expect(
      checkSplit({
        currency: "USD",
        splitType: "percent",
        totalCents: 900,
        participantIds: participants,
        inputs: { ...inputs, "user-c": "33.4" },
      }).ok,
    ).toBe(true);
  });

  it("requires at least one positive share and no negatives", () => {
    expect(
      checkSplit({
        currency: "USD",
        splitType: "shares",
        totalCents: 900,
        participantIds: participants,
        inputs: { "user-a": "0", "user-b": "0", "user-c": "0" },
      }).ok,
    ).toBe(false);
    expect(
      checkSplit({
        currency: "USD",
        splitType: "shares",
        totalCents: 900,
        participantIds: participants,
        inputs: { "user-a": "2", "user-b": "1", "user-c": "0" },
      }).ok,
    ).toBe(true);
  });
});

describe("buildSplitSpecs", () => {
  it("populates only the field for the active split type", () => {
    const percentSpecs = buildSplitSpecs({
      currency: "USD",
      splitType: "percent",
      totalCents: 900,
      participantIds: ["user-a"],
      inputs: { "user-a": "25" },
    });
    expect(percentSpecs).toEqual([{ userId: "user-a", amountCents: 0, percentBp: 2500, shares: 0 }]);

    const shareSpecs = buildSplitSpecs({
      currency: "USD",
      splitType: "shares",
      totalCents: 900,
      participantIds: ["user-a"],
      inputs: { "user-a": "3" },
    });
    expect(shareSpecs).toEqual([{ userId: "user-a", amountCents: 0, percentBp: 0, shares: 3 }]);
  });

  it("sends no specs for an itemized split, which the server derives from the items", () => {
    expect(
      buildSplitSpecs({
        currency: "USD",
        splitType: "itemized",
        totalCents: 900,
        participantIds: participants,
        inputs: {},
      }),
    ).toEqual([]);
    expect(
      checkSplit({ currency: "USD", splitType: "itemized", totalCents: 900, participantIds: participants, inputs: {} })
        .ok,
    ).toBe(true);
  });
});

describe("checkPayers", () => {
  it("passes single-payer mode unconditionally", () => {
    expect(checkPayers(900, false, {}, "USD").ok).toBe(true);
  });

  it("requires multi-payer amounts to sum to the total", () => {
    expect(checkPayers(900, true, { "user-a": "4.00", "user-b": "5.00" }, "USD").ok).toBe(true);
    expect(checkPayers(900, true, { "user-a": "4.00", "user-b": "4.00" }, "USD").ok).toBe(false);
    expect(checkPayers(900, true, {}, "USD").ok).toBe(false);
  });
});

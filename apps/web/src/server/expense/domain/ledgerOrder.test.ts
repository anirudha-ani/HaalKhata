/** Unit tests for the order of a friend statement's lines. */

import { describe, expect, it } from "vitest";
import { compareLedgerLineKeys, type LedgerLineKey } from "./ledgerOrder";

const BASE: LedgerLineKey = { day: "2026-10-20", at: "2026-10-20T12:00:00.123456Z", rank: 0, id: "b" };

describe("compareLedgerLineKeys", () => {
  it("orders by day first, then the moment written", () => {
    expect(compareLedgerLineKeys(BASE, { ...BASE, day: "2026-10-21", at: "2026-10-01T00:00:00.000000Z" })).toBeLessThan(0);
    expect(compareLedgerLineKeys(BASE, { ...BASE, at: "2026-10-20T12:00:00.123457Z" })).toBeLessThan(0);
  });

  it("puts an expense, then cancelled balances, then the payment, on one moment", () => {
    const expense = BASE;
    const offset = { ...BASE, rank: 1 };
    const payment = { ...BASE, rank: 2 };
    expect([payment, expense, offset].sort(compareLedgerLineKeys)).toEqual([expense, offset, payment]);
  });

  it("settles a tie by id, by code point", () => {
    expect(compareLedgerLineKeys({ ...BASE, id: "a-b" }, { ...BASE, id: "ab" })).toBeLessThan(0);
    expect(compareLedgerLineKeys({ ...BASE, id: "B" }, { ...BASE, id: "a" })).toBeLessThan(0);
    expect(compareLedgerLineKeys(BASE, { ...BASE })).toBe(0);
  });
});

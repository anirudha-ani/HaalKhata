/** Locale-independent ledger matching and deterministic collation ties. */

import { describe, expect, it } from "vitest";
import { compareLedgerUsers } from "./ledgerOrder";
import { expenseDebts } from "./debts";

const FIRST = "aaaaaaaa-1111-4111-8111-111111111111";
const SECOND = "abaaaaaa-1111-4111-8111-111111111111";
const THIRD = "ffffffff-1111-4111-8111-111111111111";

describe("ledger user order", () => {
  it("keeps the canonical server order for UUIDs with a Danish aa contraction", () => {
    expect([THIRD, SECOND, FIRST].sort(compareLedgerUsers)).toEqual([FIRST, SECOND, THIRD]);
  });

  it("breaks ICU canonical-equivalence ties using PostgreSQL UTF-8 order", () => {
    expect(new Intl.Collator("en-US").compare("é", "e\u0301")).toBe(0);
    expect(["é", "e\u0301"].sort(compareLedgerUsers)).toEqual(["e\u0301", "é"]);
    expect(compareLedgerUsers("same", "same")).toBe(0);
  });

  it("matches debts independently of payer insertion order, including collation ties", () => {
    const payers = [{ userId: "é", amountCents: 1 }, { userId: "e\u0301", amountCents: 1 }];
    const splits = [{ userId: FIRST, amountCents: 1 }, { userId: SECOND, amountCents: 1 }];
    const expected = [{ from: FIRST, to: "e\u0301", amountCents: 1 }, { from: SECOND, to: "é", amountCents: 1 }];
    expect(expenseDebts(payers, splits)).toEqual(expected);
    expect(expenseDebts([...payers].reverse(), [...splits].reverse())).toEqual(expected);
  });
});

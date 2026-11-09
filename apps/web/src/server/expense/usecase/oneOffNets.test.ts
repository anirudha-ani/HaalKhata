/**
 * Regression: working out the viewer's one-off balance with
 * many people reads the database a fixed number of times, not a round of
 * reads per person.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/expense/repo/expenses.repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/expense/repo/expenses.repo")>()),
  listScopedExpensesWithAnyOf: vi.fn(async () => []),
  loadExpenseChildren: vi.fn(async () => ({ payers: new Map(), splits: new Map(), items: new Map() })),
}));
vi.mock("@/server/expense/repo/settlements.repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/expense/repo/settlements.repo")>()),
  listScopedSettlementsWithAnyOf: vi.fn(async () => []),
}));

vi.mock("@/server/expense/repo/movements.repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/expense/repo/movements.repo")>()),
  sumScopedPairMovements: vi.fn(async () => []),
}));

import { sumScopedPairMovements } from "@/server/expense/repo/movements.repo";
import {
  listScopedExpensesWithAnyOf,
  loadExpenseChildren,
} from "@/server/expense/repo/expenses.repo";
import { listScopedSettlementsWithAnyOf } from "@/server/expense/repo/settlements.repo";
import { oneOffNetsWith } from "./balance.usecase";

const VIEWER = "viewer";

beforeEach(() => vi.resetAllMocks());

describe("one-off balances with many people", () => {
  it.each([1, 30])("reads one aggregate and no historical rows for %i people", async (peopleCount) => {
    const people = Array.from({ length: peopleCount }, (unused, index) => `person-${index}`);

    vi.mocked(sumScopedPairMovements).mockResolvedValue([
      { group_id: null,currency: "USD",low_user: people[0],high_user: VIEWER,cents: 30 },
      { group_id: null,currency: "EUR",low_user: people[0],high_user: VIEWER,cents: -17 },
    ]);
    const nets = await oneOffNetsWith(VIEWER, people);

    expect(sumScopedPairMovements).toHaveBeenCalledExactlyOnceWith(VIEWER,people,null,undefined);
    expect(listScopedExpensesWithAnyOf).not.toHaveBeenCalled();
    expect(loadExpenseChildren).not.toHaveBeenCalled();
    expect(listScopedSettlementsWithAnyOf).not.toHaveBeenCalled();
    expect(nets.get(people[0])).toEqual(new Map([["USD",30],["EUR",-17]]));
    expect([...nets.keys()]).toEqual(people);
  });

  it("reads nothing when there is nobody to work out", async () => {
    expect(await oneOffNetsWith(VIEWER, [VIEWER])).toEqual(new Map());
    expect(listScopedExpensesWithAnyOf).not.toHaveBeenCalled();
    expect(sumScopedPairMovements).not.toHaveBeenCalled();
  });
});

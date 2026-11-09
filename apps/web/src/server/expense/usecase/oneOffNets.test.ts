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

import {
  listScopedExpensesWithAnyOf,
  loadExpenseChildren,
} from "@/server/expense/repo/expenses.repo";
import { listScopedSettlementsWithAnyOf } from "@/server/expense/repo/settlements.repo";
import { oneOffNetsWith } from "./balance.usecase";

const VIEWER = "viewer";

beforeEach(() => vi.clearAllMocks());

describe("one-off balances with many people", () => {
  it.each([1, 30])("reads the database three times for %i people", async (peopleCount) => {
    const people = Array.from({ length: peopleCount }, (unused, index) => `person-${index}`);

    const nets = await oneOffNetsWith(VIEWER, people);

    expect(listScopedExpensesWithAnyOf).toHaveBeenCalledTimes(1);
    expect(loadExpenseChildren).toHaveBeenCalledTimes(1);
    expect(listScopedSettlementsWithAnyOf).toHaveBeenCalledTimes(1);
    expect([...nets.keys()]).toEqual(people);
  });

  it("reads nothing when there is nobody to work out", async () => {
    expect(await oneOffNetsWith(VIEWER, [VIEWER])).toEqual(new Map());
    expect(listScopedExpensesWithAnyOf).not.toHaveBeenCalled();
  });
});

/** Unit tests for joining the pages of an expense list and a friend statement. */

import { describe, expect, it } from "vitest";
import type { Expense, FriendLedgerEntry, FriendLedgerResponse, ListExpensesResponse } from "../api/plainMessages";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { firstStatementPage, mergeExpensePages, statementEntries } from "./pages";

/**
 * A page of an expense list as the reply carries it; only the fields joined are read.
 *
 * @param expenseIds - The page's expenses, newest first.
 * @param userIds - The people it names.
 * @param settledExpenseIds - Its settled expenses.
 * @returns The page.
 */
function expensePage(expenseIds: string[], userIds: string[], settledExpenseIds: string[]) {
  return {
    expenses: expenseIds.map((expenseId) => ({ id: expenseId }) as Expense),
    users: userIds.map((userId) => ({ id: userId, name: userId }) as User),
    settledExpenseIds,
  } as unknown as ListExpensesResponse;
}

/**
 * A statement line; only its id is read.
 *
 * @param lineId - The line's id.
 * @returns The line.
 */
const line = (lineId: string) => ({ id: lineId }) as FriendLedgerEntry;

describe("mergeExpensePages", () => {
  it("keeps the pages' order and joins the people and settled marks of each", () => {
    const merged = mergeExpensePages([
      expensePage(["exp-3", "exp-2"], ["ana"], ["exp-3"]),
      expensePage(["exp-1"], ["ana", "bo"], ["exp-1"]),
    ]);
    expect(merged.expenses.map((expense) => expense.id)).toEqual(["exp-3", "exp-2", "exp-1"]);
    expect([...merged.userById.keys()]).toEqual(["ana", "bo"]);
    expect(merged.settledIds).toEqual(new Set(["exp-3", "exp-1"]));
  });

  it("is empty before anything has loaded", () => {
    expect(mergeExpensePages([])).toEqual({ expenses: [], userById: new Map(), settledIds: new Set() });
  });
});

describe("statement pages", () => {
  it("starts from the ledger's own lines and cursor, then appends older pages", () => {
    const ledger = { entries: [line("line-2")], nextCursor: "older" } as unknown as FriendLedgerResponse;
    const first = firstStatementPage(ledger);
    expect(first).toEqual({ ledger, entries: ledger.entries, nextCursor: "older" });
    const older = { entries: [line("line-1")], nextCursor: "" };
    expect(statementEntries([first, older]).map((entry) => entry.id)).toEqual(["line-2", "line-1"]);
  });
});

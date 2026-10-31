/** Merging the pages of a paged expense list or friend statement into what a screen shows — pure. */

import type { Expense, FriendLedgerEntry, FriendLedgerResponse, ListExpensesResponse } from "../api/plainMessages";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";

/** An expense list's loaded pages, as one list. */
export interface MergedExpensePages {
  /** Every loaded expense, newest first. */
  expenses: Expense[];
  /** Everyone those expenses reference, by id. */
  userById: Map<string, User>;
  /** Ids of loaded expenses with nothing pending for the viewer. */
  settledIds: Set<string>;
}

/**
 * Joins the loaded pages of an expense list. Each page names the people and
 * the settled expenses of its own rows, so those are joined too.
 *
 * @param pages - The pages, newest first, as an infinite query holds them.
 * @returns The expenses, the people they name, and which are settled.
 */
export function mergeExpensePages(pages: readonly ListExpensesResponse[]): MergedExpensePages {
  return {
    expenses: pages.flatMap((page) => page.expenses),
    userById: new Map(pages.flatMap((page) => page.users.map((user) => [user.id, user] as const))),
    settledIds: new Set(pages.flatMap((page) => page.settledExpenseIds)),
  };
}

/**
 * One page of a friend statement as an infinite query holds it. The first
 * is the GetFriendLedger response, which also carries the headline, the
 * balances and the settle position; the rest are ListFriendLedgerEntries.
 */
export interface StatementPage {
  /** The whole GetFriendLedger response, on the first page only. */
  ledger?: FriendLedgerResponse;
  /** The page's lines, newest first. */
  entries: FriendLedgerEntry[];
  /** Where the next page starts; "" at the oldest line. */
  nextCursor: string;
}

/**
 * Wraps a GetFriendLedger response as a statement's first page.
 *
 * @param ledger - The response.
 * @returns The page.
 */
export function firstStatementPage(ledger: FriendLedgerResponse): StatementPage {
  return { ledger, entries: ledger.entries, nextCursor: ledger.nextCursor };
}

/**
 * Joins a statement's loaded pages.
 *
 * @param pages - The pages, newest first.
 * @returns Every loaded line, newest first.
 */
export function statementEntries(pages: readonly StatementPage[]): FriendLedgerEntry[] {
  return pages.flatMap((page) => page.entries);
}

/**
 * Unit tests for currency-bucketed balances: a pair that shares expenses in
 * two currencies has two balances, never one. Scenario: Bob paid USD 10.00
 * for Alice, Alice paid EUR 5.00 for Bob, no groups. Alice owes Bob ten
 * dollars and is owed five euros — and no arithmetic turns that into a
 * single number.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpenseRow, PayerRow, SplitRow } from "@/server/expense/repo/expenses.repo";
import type { SettlementRow } from "@/server/expense/repo/settlements.repo";
import type { UserRow } from "@/server/auth/repo/users.repo";

vi.mock("@/server/expense/repo/expenses.repo", () => ({
  listExpensesBetween: vi.fn(),
  listExpensesByGroup: vi.fn(),
  listExpensesInvolvingUser: vi.fn(),
  listOneOffExpensesBetween: vi.fn(),
  loadExpenseChildren: vi.fn(),
}));
vi.mock("@/server/expense/repo/settlements.repo", () => ({
  listOneOffSettlementsBetween: vi.fn(),
  listSettlementsBetween: vi.fn(),
  listSettlementsByGroup: vi.fn(),
  listSettlementsInvolvingUser: vi.fn(),
}));
vi.mock("@/server/group/repo/groups.repo", () => ({
  findGroupById: vi.fn(),
  isMember: vi.fn(),
  listGroupsByUser: vi.fn(),
  listMembers: vi.fn(),
}));
vi.mock("@/server/auth/repo/users.repo", () => ({
  findUserById: vi.fn(),
  findUsersByIds: vi.fn(),
}));
vi.mock("@/server/social/repo/friendships.repo", () => ({ listFriendIds: vi.fn() }));

import {
  getFriendLedger,
  getOverallBalances,
  netWithUser,
  oneOffNetsBetween,
  owedByScope,
} from "./balance.usecase";
import {
  listExpensesBetween,
  listExpensesInvolvingUser,
  listOneOffExpensesBetween,
  loadExpenseChildren,
} from "@/server/expense/repo/expenses.repo";
import {
  listOneOffSettlementsBetween,
  listSettlementsBetween,
  listSettlementsInvolvingUser,
} from "@/server/expense/repo/settlements.repo";
import { listGroupsByUser } from "@/server/group/repo/groups.repo";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import { listFriendIds } from "@/server/social/repo/friendships.repo";

const ALICE = "user-alice";
const BOBBY = "user-bob";

/**
 * Builds a one-off expense row in the given currency.
 *
 * @param expenseId - Row id.
 * @param currency - ISO 4217 code.
 * @param amountCents - Whole amount.
 * @param createdAt - Creation timestamp, which also orders the ledger.
 * @returns An expenses-table row outside any group.
 */
function expenseRow(
  expenseId: string,
  currency: string,
  amountCents: number,
  createdAt: string,
): ExpenseRow {
  return {
    id: expenseId,
    group_id: null,
    description: expenseId,
    amount_cents: amountCents,
    currency,
    category: "food",
    expense_date: createdAt.slice(0, 10),
    split_type: "exact",
    notes: "",
    tax_cents: 0,
    tip_cents: 0,
    created_by: BOBBY,
    created_at: createdAt,
    ledger_event_order: "1",
    deleted_at: null,
    deleted_by: null,
  };
}

// Bob paid $10 for Alice; Alice paid €5 for Bob.
const dollars = expenseRow("expense-dollars", "USD", 1000, "2026-08-01T10:00:00Z");
const euros = expenseRow("expense-euros", "EUR", 500, "2026-08-02T10:00:00Z");
const payersByExpense = new Map<string, PayerRow[]>([
  ["expense-dollars", [{ expense_id: "expense-dollars", user_id: BOBBY, amount_cents: 1000 }]],
  ["expense-euros", [{ expense_id: "expense-euros", user_id: ALICE, amount_cents: 500 }]],
]);
const splitsByExpense = new Map<string, SplitRow[]>([
  ["expense-dollars", [{ expense_id: "expense-dollars", user_id: ALICE, owed_cents: 1000 }]],
  ["expense-euros", [{ expense_id: "expense-euros", user_id: BOBBY, owed_cents: 500 }]],
]);
/** Settlement rows "stored" so far; tests append to simulate payments. */
let settlementRows: SettlementRow[] = [];

/**
 * Builds a users-table row for the scenario's people.
 *
 * @param userId - Row id.
 * @returns A registered user row defaulting to USD.
 */
function userRow(userId: string): UserRow {
  return {
    id: userId,
    email: `${userId}@example.com`,
    name: userId.replace("user-", ""),
    avatar_color: "#336699",
    avatar_url: null,
    default_currency: "USD",
    password_hash: "hash",
    google_sub: null,
    phone: null,
    payment_handles: [],
    onboarded_at: "2026-08-01T00:00:00Z",
  } as unknown as UserRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  settlementRows = [];
  vi.mocked(listGroupsByUser).mockResolvedValue([]);
  vi.mocked(findUserById).mockImplementation(async (userId: string) => userRow(userId));
  vi.mocked(findUsersByIds).mockImplementation(async (userIds: string[]) =>
    userIds.map(userRow),
  );
  vi.mocked(listFriendIds).mockResolvedValue([BOBBY, ALICE]);
  vi.mocked(listExpensesInvolvingUser).mockResolvedValue([dollars, euros]);
  vi.mocked(listExpensesBetween).mockResolvedValue([dollars, euros]);
  vi.mocked(listOneOffExpensesBetween).mockResolvedValue([dollars, euros]);
  vi.mocked(loadExpenseChildren).mockImplementation(async () => ({
    payers: payersByExpense,
    splits: splitsByExpense,
    items: new Map(),
  }));
  vi.mocked(listSettlementsInvolvingUser).mockImplementation(async () => settlementRows);
  vi.mocked(listSettlementsBetween).mockImplementation(async () => settlementRows);
  vi.mocked(listOneOffSettlementsBetween).mockImplementation(async () => settlementRows);
});

describe("balances are kept per currency", () => {
  it("the one-off slate is one balance per currency", async () => {
    expect(await oneOffNetsBetween(ALICE, BOBBY)).toEqual(
      new Map([
        ["USD", -1000],
        ["EUR", 500],
      ]),
    );
  });

  it("each direction owes in its own currency, never netted across", async () => {
    // The audit's scenario: 1000 owed one way and 500 the other used to
    // collapse into 500 unlabelled cents. They are two debts.
    expect(await owedByScope(ALICE, BOBBY)).toEqual([
      { groupId: null, currency: "USD", owedCents: 1000 },
    ]);
    expect(await owedByScope(BOBBY, ALICE)).toEqual([
      { groupId: null, currency: "EUR", owedCents: 500 },
    ]);
  });

  it("the dashboard totals are per currency, with the default currency first", async () => {
    const overall = await getOverallBalances(ALICE);
    expect(overall.totals).toEqual([
      { currency: "USD", youOweCents: 1000, owedToYouCents: 0 },
      { currency: "EUR", youOweCents: 0, owedToYouCents: 500 },
    ]);
    // The legacy scalars are the default-currency bucket, nothing more.
    expect(overall.youOweCents).toBe(1000);
    expect(overall.owedToYouCents).toBe(0);
    expect(overall.counterparties).toHaveLength(1);
    expect(overall.counterparties[0].balances).toEqual([
      { currency: "USD", cents: -1000 },
      { currency: "EUR", cents: 500 },
    ]);
    expect(overall.counterparties[0].netCents).toBe(-1000);
    expect(await netWithUser(BOBBY, ALICE)).toEqual(
      new Map([
        ["USD", 1000],
        ["EUR", -500],
      ]),
    );
  });

  it("the friend statement runs a separate balance column per currency", async () => {
    const ledger = await getFriendLedger(ALICE, BOBBY);
    expect(ledger.nets).toEqual([
      { currency: "USD", cents: -1000 },
      { currency: "EUR", cents: 500 },
    ]);
    expect(ledger.groupBalances).toEqual([
      { groupId: "", groupName: "", currency: "USD", netCents: -1000, simplified: false },
      { groupId: "", groupName: "", currency: "EUR", netCents: 500, simplified: false },
    ]);
    // Newest first: the euro line's running balance is the euro column's,
    // not the dollar column's continued.
    expect(ledger.entries.map((entry) => [entry.currency, entry.balanceAfterCents])).toEqual([
      ["EUR", 500],
      ["USD", -1000],
    ]);
  });

  it("a dollar payment moves the dollar column and leaves the euros alone", async () => {
    settlementRows.push({
      id: "settlement-1",
      group_id: null,
      from_user: ALICE,
      to_user: BOBBY,
      amount_cents: 1000,
      currency: "USD",
      method: "cash",
      note: "",
      created_at: "2026-08-03T00:00:00Z",
      ledger_event_order: "3",
      deleted_at: null,
      recorded_by: ALICE,
      deleted_by: null,
    });
    expect(await owedByScope(ALICE, BOBBY)).toEqual([]);
    expect(await owedByScope(BOBBY, ALICE)).toEqual([
      { groupId: null, currency: "EUR", owedCents: 500 },
    ]);
    const ledger = await getFriendLedger(ALICE, BOBBY);
    expect(ledger.nets).toEqual([{ currency: "EUR", cents: 500 }]);
    expect(ledger.entries[0]).toMatchObject({ currency: "USD", balanceAfterCents: 0 });
  });
});

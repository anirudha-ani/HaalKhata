/**
 * Unit tests for mode-aware debt routing: a group that simplifies debts must
 * route validation, friend ledgers and overall balances along the simplified
 * edges — and along the raw pairwise graph when it does not. One scenario
 * throughout: Alice owes Bob 1000 (groceries), Bob owes Cara 1000 (dinner),
 * so simplification reroutes everything into a single Alice→Cara payment.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpenseRow, PayerRow, SplitRow } from "@/server/expense/repo/expenses.repo";
import type { SettlementRow } from "@/server/expense/repo/settlements.repo";
import type { UserRow } from "@/server/auth/repo/users.repo";
import type { GroupRow } from "@/server/group/repo/groups.repo";

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
  amountOwed,
  getFriendLedger,
  getOverallBalances,
  netWithUser,
  owedByScope,
  userNetInGroup,
} from "./balance.usecase";
import {
  listExpensesBetween,
  listExpensesByGroup,
  listExpensesInvolvingUser,
  listOneOffExpensesBetween,
  loadExpenseChildren,
} from "@/server/expense/repo/expenses.repo";
import {
  listOneOffSettlementsBetween,
  listSettlementsBetween,
  listSettlementsByGroup,
  listSettlementsInvolvingUser,
} from "@/server/expense/repo/settlements.repo";
import { findGroupById, listGroupsByUser, listMembers } from "@/server/group/repo/groups.repo";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import { listFriendIds } from "@/server/social/repo/friendships.repo";

const ALICE = "user-alice";
const BOBBY = "user-bob";
const CARA = "user-cara";
const STRANGER = "user-stranger";
const TRIP = "group-trip";

/** Whether the trip group simplifies debts in the scenario being run. */
let simplify = true;
/** The settlement rows "stored" so far; tests append to simulate payments. */
let settlementRows: SettlementRow[] = [];

/**
 * Builds the trip group's row with the scenario's current simplify mode.
 *
 * @returns A groups-table row for the trip.
 */
function tripRow(): GroupRow {
  return {
    id: TRIP,
    name: "Trip",
    type: "trip",
    currency: "USD",
    created_by: ALICE,
    created_at: "2026-08-01T00:00:00Z",
    simplify_debts: simplify,
  };
}

/**
 * Builds one of the scenario's two expenses.
 *
 * @param expenseId - Row id.
 * @param description - Display description.
 * @returns An expenses-table row inside the trip group.
 */
function expenseRow(expenseId: string, description: string): ExpenseRow {
  return {
    id: expenseId,
    group_id: TRIP,
    description,
    amount_cents: 1000,
    currency: "USD",
    category: "food",
    expense_date: "2026-08-01",
    split_type: "exact",
    notes: "",
    tax_cents: 0,
    tip_cents: 0,
    created_by: BOBBY,
    created_at: "2026-08-01T10:00:00Z",
    ledger_event_order: "1",
    deleted_at: null,
    deleted_by: null,
  };
}

// Bob paid for groceries that Alice ate; Cara paid for a dinner that Bob ate.
// Pairwise: Alice→Bob 1000 and Bob→Cara 1000. Simplified: Alice→Cara 1000.
const groceries = expenseRow("expense-groceries", "Groceries");
const dinner = expenseRow("expense-dinner", "Dinner");
const payersByExpense = new Map<string, PayerRow[]>([
  ["expense-groceries", [{ expense_id: "expense-groceries", user_id: BOBBY, amount_cents: 1000 }]],
  ["expense-dinner", [{ expense_id: "expense-dinner", user_id: CARA, amount_cents: 1000 }]],
]);
const splitsByExpense = new Map<string, SplitRow[]>([
  ["expense-groceries", [{ expense_id: "expense-groceries", user_id: ALICE, owed_cents: 1000 }]],
  ["expense-dinner", [{ expense_id: "expense-dinner", user_id: BOBBY, owed_cents: 1000 }]],
]);

/**
 * Everyone an expense touches: its payers and its splits.
 *
 * @param expense - The expense row to inspect.
 * @returns The distinct user ids on the expense.
 */
function participants(expense: ExpenseRow): Set<string> {
  return new Set([
    ...(payersByExpense.get(expense.id) ?? []).map((payer) => payer.user_id),
    ...(splitsByExpense.get(expense.id) ?? []).map((split) => split.user_id),
  ]);
}

/**
 * Builds a users-table row for the scenario's people.
 *
 * @param userId - Row id.
 * @returns A registered user row with defaults for everything else.
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
  simplify = true;
  settlementRows = [];

  vi.mocked(findGroupById).mockImplementation(async () => tripRow());
  vi.mocked(listGroupsByUser).mockImplementation(async () => [tripRow()]);
  vi.mocked(listMembers).mockResolvedValue([]);
  vi.mocked(findUserById).mockImplementation(async (userId: string) => userRow(userId));
  vi.mocked(findUsersByIds).mockImplementation(async (userIds: string[]) =>
    userIds.map(userRow),
  );
  vi.mocked(listFriendIds).mockResolvedValue([]);

  vi.mocked(listExpensesByGroup).mockResolvedValue([groceries, dinner]);
  vi.mocked(listExpensesInvolvingUser).mockImplementation(async (userId: string) =>
    [groceries, dinner].filter((expense) => participants(expense).has(userId)),
  );
  vi.mocked(listExpensesBetween).mockImplementation(async (userId: string, otherId: string) =>
    [groceries, dinner].filter(
      (expense) => participants(expense).has(userId) && participants(expense).has(otherId),
    ),
  );
  vi.mocked(listOneOffExpensesBetween).mockResolvedValue([]);
  vi.mocked(loadExpenseChildren).mockImplementation(async () => ({
    payers: payersByExpense,
    splits: splitsByExpense,
    items: new Map(),
  }));

  vi.mocked(listSettlementsByGroup).mockImplementation(async () =>
    settlementRows.filter((stored) => stored.group_id === TRIP),
  );
  vi.mocked(listSettlementsInvolvingUser).mockImplementation(async (userId: string) =>
    settlementRows.filter((stored) => stored.from_user === userId || stored.to_user === userId),
  );
  vi.mocked(listSettlementsBetween).mockImplementation(async (userId: string, otherId: string) =>
    settlementRows.filter(
      (stored) =>
        (stored.from_user === userId && stored.to_user === otherId) ||
        (stored.from_user === otherId && stored.to_user === userId),
    ),
  );
  vi.mocked(listOneOffSettlementsBetween).mockResolvedValue([]);
});

/**
 * Appends a stored settlement inside the trip group.
 *
 * @param fromUser - Who paid.
 * @param toUser - Who was paid.
 * @param amountCents - How much.
 */
function recordTripSettlement(fromUser: string, toUser: string, amountCents: number): void {
  settlementRows.push({
    id: `settlement-${settlementRows.length}`,
    group_id: TRIP,
    from_user: fromUser,
    to_user: toUser,
    amount_cents: amountCents,
    currency: "USD",
    method: "cash",
    note: "",
    created_at: "2026-08-02T00:00:00Z",
    ledger_event_order: "2",
    deleted_at: null,
    recorded_by: fromUser,
    deleted_by: null,
  });
}

describe("the settlement guards route with the group's mode", () => {
  it("simplified: the rerouted edge is owed, the pairwise one is not", async () => {
    // Alice's debt to Bob was rerouted into paying Cara directly; letting her
    // also pay Bob would let the same 1000 leave her twice.
    expect(await amountOwed(ALICE, CARA, TRIP)).toBe(1000);
    expect(await amountOwed(ALICE, BOBBY, TRIP)).toBe(0);
    expect(await amountOwed(BOBBY, CARA, TRIP)).toBe(0);
  });

  it("pairwise: exactly the reverse", async () => {
    simplify = false;
    expect(await amountOwed(ALICE, BOBBY, TRIP)).toBe(1000);
    expect(await amountOwed(BOBBY, CARA, TRIP)).toBe(1000);
    expect(await amountOwed(ALICE, CARA, TRIP)).toBe(0);
  });

  it("owedByScope offers the simplified edge and only that", async () => {
    expect(await owedByScope(ALICE, CARA)).toEqual([{ groupId: TRIP, currency: "USD", owedCents: 1000 }]);
    expect(await owedByScope(ALICE, BOBBY)).toEqual([]);
  });
});

describe("friend ledgers under simplification", () => {
  it("shows the routed debt between two people who never shared an expense", async () => {
    const ledger = await getFriendLedger(ALICE, CARA);
    expect(ledger.netCents).toBe(-1000);
    expect(ledger.entries).toEqual([]);
    expect(ledger.groupBalances).toEqual([
      { groupId: TRIP, groupName: "Trip", currency: "USD", netCents: -1000, simplified: true },
    ]);
  });

  it("keeps a zero row where history exists but the debt was rerouted away", async () => {
    const ledger = await getFriendLedger(ALICE, BOBBY);
    // The shared history still says Alice owes Bob for the groceries…
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0].balanceAfterCents).toBe(-1000);
    // …but the routed balance is zero, and the row stays to say why.
    expect(ledger.netCents).toBe(0);
    expect(ledger.groupBalances).toEqual([
      { groupId: TRIP, groupName: "Trip", currency: "USD", netCents: 0, simplified: true },
    ]);
  });

  it("pairwise mode keeps the history and the headline in agreement", async () => {
    simplify = false;
    const ledger = await getFriendLedger(ALICE, BOBBY);
    expect(ledger.netCents).toBe(-1000);
    expect(ledger.groupBalances).toEqual([
      { groupId: TRIP, groupName: "Trip", currency: "USD", netCents: -1000, simplified: false },
    ]);
  });

  it("returns the same not-found response for unrelated and nonexistent ids", async () => {
    vi.mocked(listGroupsByUser).mockResolvedValue([]);

    await expect(getFriendLedger(ALICE, STRANGER)).rejects.toMatchObject({
      code: "not_found",
      message: "friend ledger not found",
    });

    vi.mocked(findUserById).mockResolvedValueOnce(undefined);
    await expect(getFriendLedger(ALICE, "missing-user")).rejects.toMatchObject({
      code: "not_found",
      message: "friend ledger not found",
    });
  });

  it("allows an explicit friend even with no mutual group or history", async () => {
    vi.mocked(listGroupsByUser).mockResolvedValue([]);
    vi.mocked(listFriendIds).mockResolvedValue([STRANGER]);

    const ledger = await getFriendLedger(ALICE, STRANGER);

    expect(ledger.friend.id).toBe(STRANGER);
    expect(ledger.entries).toEqual([]);
    expect(ledger.mutualGroups).toEqual([]);
    expect(ledger.isFriend).toBe(true);
  });
});

describe("overall balances under simplification", () => {
  it("the dashboard shows the routed counterparty, not the historical one", async () => {
    const overall = await getOverallBalances(ALICE);
    expect(overall.youOweCents).toBe(1000);
    expect(overall.owedToYouCents).toBe(0);
    expect(overall.counterparties).toHaveLength(1);
    expect(overall.counterparties[0].user.id).toBe(CARA);
    expect(overall.counterparties[0].netCents).toBe(-1000);
  });

  it("the middle of the chain nets to nothing against everyone", async () => {
    expect((await netWithUser(BOBBY, ALICE)).get("USD") ?? 0).toBe(0);
    expect((await netWithUser(BOBBY, CARA)).get("USD") ?? 0).toBe(0);
    expect((await netWithUser(CARA, ALICE)).get("USD") ?? 0).toBe(1000);
  });

  it("pairwise mode shows the historical counterparty again", async () => {
    simplify = false;
    const overall = await getOverallBalances(ALICE);
    expect(overall.counterparties).toHaveLength(1);
    expect(overall.counterparties[0].user.id).toBe(BOBBY);
  });
});

describe("after paying along the simplified edge", () => {
  beforeEach(() => recordTripSettlement(ALICE, CARA, 1000));

  it("every guard, ledger and net reads settled", async () => {
    expect(await amountOwed(ALICE, CARA, TRIP)).toBe(0);
    expect(await owedByScope(ALICE, CARA)).toEqual([]);
    for (const member of [ALICE, BOBBY, CARA]) {
      expect(await userNetInGroup(member, TRIP)).toBe(0);
      expect((await getOverallBalances(member)).counterparties).toEqual([]);
    }
  });

  it("turning simplification off exposes the loop honestly, still netting to zero", async () => {
    simplify = false;
    // Pairwise the three debts are all real — Alice→Bob and Bob→Cara from the
    // expenses, Cara→Alice from the payment — and they cancel around the
    // loop. This is the state the balances panel explains to the user.
    expect(await amountOwed(ALICE, BOBBY, TRIP)).toBe(1000);
    expect(await amountOwed(BOBBY, CARA, TRIP)).toBe(1000);
    expect(await amountOwed(CARA, ALICE, TRIP)).toBe(1000);
    for (const member of [ALICE, BOBBY, CARA]) {
      expect(await userNetInGroup(member, TRIP)).toBe(0);
    }
  });
});

/**
 * Unit tests for who hears about a transaction: expense, comment and
 * settlement activity is announced to the participants — never to group
 * members who were not part of it. If you are A, "B paid C" is B and C's
 * feed line.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { CreateExpenseRequest } from "@haalkhata/protogen/expense/v1/expense_pb";
import type { ExpenseRow } from "@/server/expense/repo/expenses.repo";
import type { SettlementRow } from "@/server/expense/repo/settlements.repo";
import type { UserRow } from "@/server/auth/repo/users.repo";
import type { GroupRow } from "@/server/group/repo/groups.repo";
import type { CommentRow } from "@/server/expense/repo/comments.repo";

vi.mock("@/server/expense/repo/expenses.repo", () => ({
  findExpenseById: vi.fn(),
  insertExpense: vi.fn(),
  listExpensesByGroup: vi.fn(),
  listExpensesInvolvingUser: vi.fn(),
  listOneOffExpensesBetween: vi.fn(),
  loadExpenseChildren: vi.fn(),
  replaceExpense: vi.fn(),
  softDeleteExpense: vi.fn(),
}));
vi.mock("@/server/group/repo/groups.repo", () => ({
  findGroupById: vi.fn(),
  isMember: vi.fn(),
  listMembers: vi.fn(),
}));
vi.mock("@/server/auth/repo/users.repo", () => ({
  findUserById: vi.fn(),
  findUsersByIds: vi.fn(),
}));
vi.mock("@/server/social/repo/friendships.repo", () => ({ insertFriendship: vi.fn() }));
vi.mock("@/server/expense/repo/comments.repo", () => ({
  insertComment: vi.fn(),
  listCommentsByExpense: vi.fn(),
}));
vi.mock("@/server/expense/repo/settlements.repo", () => ({
  insertSettlement: vi.fn(),
  withSettlementPairLock: vi.fn(
    (first: string, second: string, operation: (client: PoolClient) => Promise<unknown>) =>
      operation({} as PoolClient),
  ),
}));
vi.mock("@/server/social/repo/activity.repo", () => ({
  insertActivity: vi.fn(),
  listActivityForExpense: vi.fn(),
}));
vi.mock("@/server/social/repo/notifications.repo", () => ({ insertNotifications: vi.fn() }));
vi.mock("./balance.usecase", () => ({ amountOwed: vi.fn(), owedByScope: vi.fn() }));

import { addComment, createExpense, recordSettlement } from "./expense.usecase";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import { findGroupById, isMember } from "@/server/group/repo/groups.repo";
import {
  findExpenseById,
  insertExpense,
  loadExpenseChildren,
} from "@/server/expense/repo/expenses.repo";
import { insertComment } from "@/server/expense/repo/comments.repo";
import { insertSettlement } from "@/server/expense/repo/settlements.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { amountOwed } from "./balance.usecase";

const PAYER = "user-payer";
const OWER = "user-ower";
const OUTSIDER = "user-outsider";
const GOA_TRIP = "group-goa";

/** Every audience insertActivity received, in call order. */
function audiences(): string[][] {
  return vi.mocked(insertActivity).mock.calls.map(([input]) => [...input.audience].sort());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockImplementation(
    async (userId: string) =>
      ({ id: userId, name: `Name ${userId}`, default_currency: "USD" }) as UserRow,
  );
  vi.mocked(findUsersByIds).mockImplementation(
    async (userIds: string[]) =>
      userIds.map((userId) => ({ id: userId, name: `Name ${userId}` }) as UserRow),
  );
  vi.mocked(findGroupById).mockImplementation(
    async (groupId: string) => ({ id: groupId, name: "Goa", currency: "USD" }) as GroupRow,
  );
  // Everyone in these tests is a member — the point under test is that
  // membership alone no longer puts anyone in a transaction's audience.
  vi.mocked(isMember).mockResolvedValue(true);
  vi.mocked(insertExpense).mockResolvedValue("expense-1");
  // The stored expense, as createExpense's return path and addComment read it
  // back: Payer paid 1000, Ower owes 1000, inside the group.
  vi.mocked(findExpenseById).mockResolvedValue({
    id: "expense-1",
    group_id: GOA_TRIP,
    description: "Dinner",
    amount_cents: 1000,
    currency: "USD",
    category: "food",
    expense_date: "2026-08-09",
    split_type: "exact",
    notes: "",
    tax_cents: 0,
    tip_cents: 0,
    created_by: PAYER,
    created_at: "2026-08-09T00:00:00Z",
    deleted_at: null,
  } as ExpenseRow);
  vi.mocked(loadExpenseChildren).mockResolvedValue({
    payers: new Map([
      ["expense-1", [{ expense_id: "expense-1", user_id: PAYER, amount_cents: 1000 }]],
    ]),
    splits: new Map([
      ["expense-1", [{ expense_id: "expense-1", user_id: OWER, owed_cents: 1000 }]],
    ]),
    items: new Map(),
  });
  vi.mocked(insertActivity).mockResolvedValue(undefined as never);
  vi.mocked(insertNotifications).mockResolvedValue(undefined);
  vi.mocked(insertSettlement).mockImplementation(
    async (input) =>
      ({
        id: "settlement-1",
        group_id: input.groupId,
        from_user: input.fromUser,
        to_user: input.toUser,
        amount_cents: input.amountCents,
        currency: input.currency,
        method: input.method,
        note: input.note,
        created_at: "2026-08-09T00:00:00Z",
      }) as SettlementRow,
  );
});

describe("who hears about a transaction", () => {
  it("a group expense is announced to its participants, not the whole group", async () => {
    await createExpense(PAYER, {
      groupId: GOA_TRIP,
      description: "Dinner",
      amountCents: 1000,
      currency: "USD",
      category: "food",
      expenseDate: "2026-08-09",
      splitType: "exact",
      notes: "",
      payers: [{ userId: PAYER, amountCents: 1000 }],
      splitSpecs: [{ userId: OWER, amountCents: 1000, percentBp: 0, shares: 0 }],
      items: [],
      taxCents: 0,
      tipCents: 0,
    } as unknown as CreateExpenseRequest);

    expect(audiences()).toEqual([[OWER, PAYER].sort()]);
  });

  it("a comment follows its expense's participants (plus the author)", async () => {
    vi.mocked(insertComment).mockResolvedValue({
      id: "comment-1",
      expense_id: "expense-1",
      user_id: OWER,
      body: "thanks!",
      created_at: "2026-08-09T00:00:00Z",
    } as CommentRow);

    await addComment(OWER, "expense-1", "thanks!");

    expect(audiences()).toEqual([[OWER, PAYER].sort()]);
  });

  it("a group settlement is announced to the pair, never the room", async () => {
    vi.mocked(amountOwed).mockResolvedValue(1000);

    await recordSettlement(PAYER, {
      groupId: GOA_TRIP,
      toUserId: OWER,
      amountCents: 1000,
      currency: "USD",
      method: "cash",
      note: "",
    });

    const [audience] = audiences();
    expect(audience).toEqual([OWER, PAYER].sort());
    expect(audience).not.toContain(OUTSIDER);
  });
});

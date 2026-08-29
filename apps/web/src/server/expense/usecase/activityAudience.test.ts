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

const { transactionClient } = vi.hoisted(() => ({ transactionClient: {} as PoolClient }));

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
  listCoMemberIds: vi.fn(),
  listGroupsByUser: vi.fn(),
  listMembers: vi.fn(),
}));
vi.mock("@/server/auth/repo/users.repo", () => ({
  findUserById: vi.fn(),
  findUsersByIds: vi.fn(),
}));
vi.mock("@/server/social/repo/friendships.repo", () => ({
  insertFriendship: vi.fn(),
  listFriendIds: vi.fn(),
}));
vi.mock("@/server/expense/repo/comments.repo", () => ({
  insertComment: vi.fn(),
  listCommentsByExpense: vi.fn(),
}));
vi.mock("@/server/expense/repo/settlements.repo", () => ({
  insertSettlement: vi.fn(),
  scopeHasSettlements: vi.fn(),
  withSettlementPairLock: vi.fn(
    (first: string, second: string, operation: (client: PoolClient) => Promise<unknown>) =>
      operation(transactionClient),
  ),
}));
vi.mock("@/server/common/ledgerLocks", () => ({
  lockExpenseLedger: vi.fn(),
  lockGroupLedgers: vi.fn(),
  lockPairLedgers: vi.fn(),
  withLedgerTransaction: vi.fn(
    (operation: (client: PoolClient) => Promise<unknown>) => operation(transactionClient),
  ),
}));
vi.mock("@/server/social/repo/activity.repo", () => ({
  insertActivity: vi.fn(),
  listActivityForExpense: vi.fn(),
}));
vi.mock("@/server/social/repo/notifications.repo", () => ({ insertNotifications: vi.fn() }));
vi.mock("./balance.usecase", () => ({
  amountOwed: vi.fn(),
  oneOffNetBetween: vi.fn(),
  owedByScope: vi.fn(),
  userNetInGroup: vi.fn(),
}));

import {
  addComment,
  createExpense,
  deleteExpense,
  getExpense,
  recordSettlement,
  updateExpense,
} from "./expense.usecase";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import {
  findGroupById,
  isMember,
  listCoMemberIds,
  listGroupsByUser,
  listMembers,
} from "@/server/group/repo/groups.repo";
import {
  findExpenseById,
  insertExpense,
  loadExpenseChildren,
  replaceExpense,
  softDeleteExpense,
} from "@/server/expense/repo/expenses.repo";
import { insertComment, listCommentsByExpense } from "@/server/expense/repo/comments.repo";
import {
  insertSettlement,
  scopeHasSettlements,
} from "@/server/expense/repo/settlements.repo";
import {
  lockExpenseLedger,
  lockGroupLedgers,
  lockPairLedgers,
} from "@/server/common/ledgerLocks";
import { insertActivity, listActivityForExpense } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { listFriendIds } from "@/server/social/repo/friendships.repo";
import { amountOwed, userNetInGroup } from "./balance.usecase";
import {
  MAX_EXPENSE_ITEM_NAME_LENGTH,
  MAX_EXPENSE_NOTES_LENGTH,
  MAX_SETTLEMENT_NOTE_LENGTH,
} from "@/server/expense/expense.constants";

const PAYER = "user-payer";
const OWER = "user-ower";
const OUTSIDER = "user-outsider";
const GOA_TRIP = "group-goa";

/** Builds a valid exact-split request for input-boundary tests. */
function validExpenseRequest(
  overrides: Record<string, unknown> = {},
): CreateExpenseRequest {
  return {
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
    ...overrides,
  } as unknown as CreateExpenseRequest;
}

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
  vi.mocked(listMembers).mockResolvedValue([
    { id: PAYER },
    { id: OWER },
    { id: OUTSIDER },
  ] as never);
  vi.mocked(listFriendIds).mockResolvedValue([]);
  vi.mocked(listCoMemberIds).mockResolvedValue([]);
  vi.mocked(listGroupsByUser).mockResolvedValue([]);
  vi.mocked(scopeHasSettlements).mockResolvedValue(false);
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
    ledger_event_order: "42",
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
  it("rejects oversized expense notes before persistence", async () => {
    await expect(
      createExpense(PAYER, validExpenseRequest({
        notes: "N".repeat(MAX_EXPENSE_NOTES_LENGTH + 1),
      })),
    ).rejects.toThrow(/notes are too long/);
    expect(insertExpense).not.toHaveBeenCalled();
  });

  it("rejects oversized item names before persistence", async () => {
    await expect(
      createExpense(PAYER, validExpenseRequest({
        splitType: "itemized",
        splitSpecs: [],
        items: [{
          name: "I".repeat(MAX_EXPENSE_ITEM_NAME_LENGTH + 1),
          quantity: 1,
          totalCents: 1000,
          assignments: [{ userId: OWER, weight: 1 }],
        }],
      })),
    ).rejects.toThrow(/item name is too long/);
    expect(insertExpense).not.toHaveBeenCalled();
  });

  it("rejects malformed one-off expense currencies", async () => {
    await expect(
      createExpense(PAYER, validExpenseRequest({
        groupId: "",
        currency: "USDD",
        splitSpecs: [{ userId: PAYER, amountCents: 1000, percentBp: 0, shares: 0 }],
      })),
    ).rejects.toThrow(/three-letter code/);
    expect(insertExpense).not.toHaveBeenCalled();
  });

  it("rejects oversized settlement notes before persistence", async () => {
    await expect(
      recordSettlement(PAYER, {
        groupId: GOA_TRIP,
        toUserId: OWER,
        amountCents: 1000,
        currency: "USD",
        method: "cash",
        note: "N".repeat(MAX_SETTLEMENT_NOTE_LENGTH + 1),
      }),
    ).rejects.toThrow(/settlement note is too long/);
    expect(insertSettlement).not.toHaveBeenCalled();
  });

  it("rejects itemized totals that overflow a stored money field", async () => {
    await expect(
      createExpense(PAYER, {
        groupId: GOA_TRIP,
        description: "Overflowing receipt",
        amountCents: 0,
        currency: "USD",
        category: "food",
        expenseDate: "2026-08-09",
        splitType: "itemized",
        notes: "",
        payers: [{ userId: PAYER, amountCents: 2_000_000_000 }],
        splitSpecs: [],
        items: [
          {
            name: "First item",
            quantity: 1,
            totalCents: 1_500_000_000,
            assignments: [{ userId: PAYER, weight: 1 }],
          },
          {
            name: "Second item",
            quantity: 1,
            totalCents: 1_500_000_000,
            assignments: [{ userId: PAYER, weight: 1 }],
          },
        ],
        taxCents: 0,
        tipCents: 0,
      } as unknown as CreateExpenseRequest),
    ).rejects.toMatchObject({
      code: "invalid_argument",
      message: "amount is too large (max 2000000000 cents)",
    });
    expect(insertExpense).not.toHaveBeenCalled();
  });

  it("requires an itemized request to state its computed total", async () => {
    await expect(
      createExpense(PAYER, {
        groupId: GOA_TRIP,
        description: "Missing total",
        amountCents: 0,
        currency: "USD",
        category: "food",
        expenseDate: "2026-08-09",
        splitType: "itemized",
        notes: "",
        payers: [{ userId: PAYER, amountCents: 1000 }],
        splitSpecs: [],
        items: [
          {
            name: "Meal",
            quantity: 1,
            totalCents: 1000,
            assignments: [{ userId: PAYER, weight: 1 }],
          },
        ],
        taxCents: 0,
        tipCents: 0,
      } as unknown as CreateExpenseRequest),
    ).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("do not match the stated total"),
    });
    expect(insertExpense).not.toHaveBeenCalled();
  });

  it("rejects an item with more than the bounded assignment count", async () => {
    await expect(
      createExpense(PAYER, {
        groupId: GOA_TRIP,
        description: "Oversized item",
        amountCents: 1000,
        currency: "USD",
        category: "food",
        expenseDate: "2026-08-09",
        splitType: "itemized",
        notes: "",
        payers: [{ userId: PAYER, amountCents: 1000 }],
        splitSpecs: [],
        items: [
          {
            name: "Shared item",
            quantity: 1,
            totalCents: 1000,
            assignments: Array.from({ length: 101 }, (_unusedValue, index) => ({
              userId: `user-${index}`,
              weight: 1,
            })),
          },
        ],
        taxCents: 0,
        tipCents: 0,
      } as unknown as CreateExpenseRequest),
    ).rejects.toMatchObject({
      code: "invalid_argument",
      message: "too many people assigned to one item (max 100)",
    });
    expect(insertExpense).not.toHaveBeenCalled();
  });

  it("rejects assigning one-off debt to an unrelated account", async () => {
    await expect(
      createExpense(PAYER, {
        groupId: "",
        description: "Fabricated debt",
        amountCents: 500_000,
        currency: "USD",
        category: "general",
        expenseDate: "2026-08-09",
        splitType: "exact",
        notes: "",
        payers: [{ userId: PAYER, amountCents: 500_000 }],
        splitSpecs: [
          { userId: OUTSIDER, amountCents: 500_000, percentBp: 0, shares: 0 },
        ],
        items: [],
        taxCents: 0,
        tipCents: 0,
      } as unknown as CreateExpenseRequest),
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(insertExpense).not.toHaveBeenCalled();
  });

  it("rejects moving an expense to a different ledger scope", async () => {
    await expect(
      updateExpense(PAYER, "expense-1", {
        groupId: "",
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
      } as unknown as CreateExpenseRequest),
    ).rejects.toMatchObject({
      code: "invalid_argument",
      message: "an expense cannot be moved between groups; delete it and create it in the right group",
    });
  });

  it("refuses to edit an expense after its group ledger has a settlement", async () => {
    vi.mocked(scopeHasSettlements).mockResolvedValue(true);

    await expect(
      updateExpense(PAYER, "expense-1", validExpenseRequest()),
    ).rejects.toThrow(/add a correction instead/);

    expect(lockExpenseLedger).toHaveBeenCalledWith(transactionClient, "expense-1");
    expect(lockGroupLedgers).toHaveBeenCalledWith(transactionClient, [GOA_TRIP]);
    expect(scopeHasSettlements).toHaveBeenCalledWith(
      GOA_TRIP,
      [PAYER, OWER],
      "42",
      transactionClient,
    );
    expect(replaceExpense).not.toHaveBeenCalled();
  });

  it("locks every affected one-off pair before checking settlement history", async () => {
    vi.mocked(findExpenseById).mockResolvedValue({
      ...(await findExpenseById("expense-1"))!,
      group_id: null,
    });
    vi.mocked(listFriendIds).mockResolvedValue([OWER]);
    vi.mocked(scopeHasSettlements).mockResolvedValue(true);

    await expect(
      updateExpense(PAYER, "expense-1", validExpenseRequest({ groupId: "" })),
    ).rejects.toThrow(/add a correction instead/);

    expect(lockPairLedgers).toHaveBeenCalledWith(transactionClient, [PAYER, OWER]);
    expect(scopeHasSettlements).toHaveBeenCalledWith(
      null,
      [PAYER, OWER],
      "42",
      transactionClient,
    );
    expect(replaceExpense).not.toHaveBeenCalled();
  });

  it("tells the detail view when a later settlement has locked the expense", async () => {
    vi.mocked(listCommentsByExpense).mockResolvedValue([]);
    vi.mocked(listActivityForExpense).mockResolvedValue([]);
    vi.mocked(userNetInGroup).mockResolvedValue(0);
    vi.mocked(scopeHasSettlements).mockResolvedValue(true);

    const detail = await getExpense(PAYER, "expense-1");

    // The same predicate the mutation paths apply under their lock, so the
    // page and the server can never disagree about which expenses are
    // frozen — read advisorily here, with no transaction client.
    expect(detail.lockedBySettlement).toBe(true);
    expect(scopeHasSettlements).toHaveBeenCalledWith(GOA_TRIP, [PAYER, OWER], "42");
  });

  it("reports an expense as editable while its scope has no later settlement", async () => {
    vi.mocked(listCommentsByExpense).mockResolvedValue([]);
    vi.mocked(listActivityForExpense).mockResolvedValue([]);
    vi.mocked(userNetInGroup).mockResolvedValue(0);

    const detail = await getExpense(OWER, "expense-1");

    expect(detail.lockedBySettlement).toBe(false);
  });

  it("refuses to delete an expense after its group ledger has a settlement", async () => {
    vi.mocked(scopeHasSettlements).mockResolvedValue(true);

    await expect(deleteExpense(PAYER, "expense-1")).rejects.toThrow(/add a correction instead/);

    expect(lockExpenseLedger).toHaveBeenCalledWith(transactionClient, "expense-1");
    expect(lockGroupLedgers).toHaveBeenCalledWith(transactionClient, [GOA_TRIP]);
    expect(scopeHasSettlements).toHaveBeenCalledWith(
      GOA_TRIP,
      [PAYER, OWER],
      "42",
      transactionClient,
    );
    expect(softDeleteExpense).not.toHaveBeenCalled();
  });

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
    expect(lockGroupLedgers).toHaveBeenCalledWith(transactionClient, [GOA_TRIP]);
    expect(insertExpense).toHaveBeenCalledWith(expect.any(Object), transactionClient);
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
    expect(lockGroupLedgers).toHaveBeenCalledWith(transactionClient, [GOA_TRIP]);
    expect(amountOwed).toHaveBeenCalledWith(PAYER, OWER, GOA_TRIP, transactionClient);
  });
});

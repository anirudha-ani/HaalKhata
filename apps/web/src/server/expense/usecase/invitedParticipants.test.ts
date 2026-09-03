/** Regression tests for the §33 gate: an Invited (unregistered) person is never on a transaction. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { UserRow } from "@/server/auth/repo/users.repo";

const { transactionClient } = vi.hoisted(() => ({ transactionClient: {} as PoolClient }));

vi.mock("@/server/expense/repo/expenses.repo", () => ({
  findExpenseById: vi.fn(),
  insertExpense: vi.fn(),
  loadExpenseChildren: vi.fn(),
}));
vi.mock("@/server/group/repo/groups.repo", () => ({
  findGroupById: vi.fn(),
  isMember: vi.fn(),
  listCoMemberIds: vi.fn(),
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
vi.mock("@/server/social/repo/activity.repo", () => ({ insertActivity: vi.fn() }));
vi.mock("@/server/social/repo/notifications.repo", () => ({ insertNotifications: vi.fn() }));
vi.mock("@/server/common/operations", () => ({
  beginOperation: vi.fn().mockResolvedValue({ replayOf: null }),
  finishOperation: vi.fn(),
}));
vi.mock("@/server/common/ledgerLocks", () => ({
  lockGroupLedgers: vi.fn(),
  lockParticipantLedgers: vi.fn(),
  withLedgerTransaction: vi.fn(
    (operation: (client: PoolClient) => Promise<unknown>) => operation(transactionClient),
  ),
}));

import { createExpense } from "./expense.usecase";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import { listFriendIds } from "@/server/social/repo/friendships.repo";
import { listCoMemberIds } from "@/server/group/repo/groups.repo";
import { insertExpense, findExpenseById, loadExpenseChildren } from "@/server/expense/repo/expenses.repo";
import type { CreateExpenseRequest } from "@haalkhata/protogen/expense/v1/expense_pb";

const CALLER = "user-caller";
const INVITED = "user-invited";

/**
 * Builds a users row with defaults for the columns a test does not care about.
 *
 * @param overrides - Columns to set explicitly.
 * @returns A complete UserRow.
 */
function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: CALLER,
    email: "caller@example.com",
    name: "Caller",
    avatar_color: "#123456",
    avatar_url: null,
    default_currency: "USD",
    password_hash: null,
    phone: null,
    google_sub: "google-caller",
    onboarded_at: null,
    merged_into: null,
    token_version: 0,
    created_at: "2026-09-01T00:00:00Z",
    payment_handles: [],
    ...overrides,
  };
}

/** A one-off split between the caller and one other person. */
function splitRequest(otherId: string): CreateExpenseRequest {
  return {
    groupId: "",
    description: "Dinner",
    amountCents: 2000,
    currency: "USD",
    category: "food",
    expenseDate: "2026-09-01",
    splitType: "equal",
    notes: "",
    payers: [{ userId: CALLER, amountCents: 2000 }],
    splitSpecs: [{ userId: CALLER }, { userId: otherId }],
    items: [],
    taxCents: 0,
    tipCents: 0,
    operationId: "",
  } as unknown as CreateExpenseRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockResolvedValue(userRow());
  vi.mocked(listFriendIds).mockResolvedValue([INVITED, "user-friend"]);
  vi.mocked(listCoMemberIds).mockResolvedValue([]);
  vi.mocked(insertExpense).mockResolvedValue("expense-1");
  vi.mocked(findExpenseById).mockResolvedValue({
    id: "expense-1",
    group_id: null,
    description: "Dinner",
    amount_cents: 2000,
    currency: "USD",
    category: "food",
    expense_date: "2026-09-01",
    split_type: "equal",
    notes: "",
    created_by: CALLER,
    created_at: "2026-09-01T00:00:00.000Z",
    tax_cents: 0,
    tip_cents: 0,
    deleted_at: null,
  } as never);
  vi.mocked(loadExpenseChildren).mockResolvedValue({
    payers: new Map(),
    splits: new Map(),
    items: new Map(),
  } as never);
});

describe("the Invited transaction gate (§33)", () => {
  it("refuses an unregistered participant by name, with the remedy", async () => {
    vi.mocked(findUsersByIds).mockResolvedValue([
      userRow(),
      userRow({ id: INVITED, name: "Rifat", google_sub: null, password_hash: null }),
    ]);

    await expect(createExpense(CALLER, splitRequest(INVITED))).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("Rifat hasn't joined HaalKhata yet"),
    });
    expect(insertExpense).not.toHaveBeenCalled();
  });

  it("accepts the same split once the person is registered", async () => {
    vi.mocked(findUsersByIds).mockResolvedValue([
      userRow(),
      userRow({ id: "user-friend", name: "Tanvir", google_sub: "google-friend" }),
    ]);

    await createExpense(CALLER, splitRequest("user-friend"));

    expect(insertExpense).toHaveBeenCalled();
  });
});

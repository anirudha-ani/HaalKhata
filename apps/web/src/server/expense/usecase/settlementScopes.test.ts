/** Unit tests for where a settlement's rows land: scope re-homing, selection, caps. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { SettlementRow } from "@/server/expense/repo/settlements.repo";

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

import { recordSettlement } from "./expense.usecase";
import { findUserById } from "@/server/auth/repo/users.repo";
import { findGroupById, listMembers } from "@/server/group/repo/groups.repo";
import { insertSettlement } from "@/server/expense/repo/settlements.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { owedByScope } from "./balance.usecase";

const PAYER = "user-payer";
const CREDITOR = "user-creditor";

/** Arms every stub a settlement needs to get from validation to its writes. */
function armRepos(): void {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockImplementation(async (userId: string) => {
    return { id: userId, name: userId === PAYER ? "Petra Payer" : "Carl Creditor" } as Awaited<
      ReturnType<typeof findUserById>
    >;
  });
  vi.mocked(findGroupById).mockImplementation(async (groupId: string) => {
    return { id: groupId, name: `Group ${groupId}`, currency: "USD" } as Awaited<
      ReturnType<typeof findGroupById>
    >;
  });
  vi.mocked(listMembers).mockResolvedValue([]);
  vi.mocked(insertSettlement).mockImplementation(
    async (input) =>
      ({
        id: `settlement-${input.groupId ?? "direct"}`,
        group_id: input.groupId,
        from_user: input.fromUser,
        to_user: input.toUser,
        amount_cents: input.amountCents,
        currency: input.currency,
        method: input.method,
        note: input.note,
        created_at: "2026-07-30T00:00:00Z",
      }) as SettlementRow,
  );
  vi.mocked(insertNotifications).mockResolvedValue(undefined);
  vi.mocked(insertActivity).mockResolvedValue(undefined as never);
}

beforeEach(armRepos);

/**
 * Records a payment from the payer with no explicit group scope.
 *
 * @param amountCents - Payment size.
 * @param scopeGroupIds - Selected scopes; omitted = all.
 * @returns Every insertSettlement call's input, in insertion order.
 */
async function settle(amountCents: number, scopeGroupIds?: string[]) {
  await recordSettlement(PAYER, {
    groupId: "",
    toUserId: CREDITOR,
    amountCents,
    currency: "USD",
    method: "cash",
    note: "",
    scopeGroupIds,
  });
  return vi.mocked(insertSettlement).mock.calls.map(([input]) => input);
}

describe("recordSettlement — rows land in the scope holding the debt", () => {
  it("records a friends-tab payment inside the group where the debt lives", async () => {
    // The production incident: the debt existed only in a group; the payment
    // was recorded from the friends tab with no scope, so the group ledger
    // never saw it, kept demanding the money, and accepted a second payment.
    vi.mocked(owedByScope).mockResolvedValue([{ groupId: "goa", owedCents: 10652 }]);
    const inserted = await settle(10652);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].groupId).toBe("goa");
  });

  it("splits a bundled payment into one row per scope, direct slate first", async () => {
    vi.mocked(owedByScope).mockResolvedValue([
      { groupId: "goa", owedCents: 8000 },
      { groupId: null, owedCents: 2000 },
    ]);
    const inserted = await settle(10_000);
    expect(inserted.map((input) => [input.groupId, input.amountCents])).toEqual([
      [null, 2000],
      ["goa", 8000],
    ]);
  });

  it("honors a partial selection: unchecked scopes are untouched", async () => {
    vi.mocked(owedByScope).mockResolvedValue([
      { groupId: "goa", owedCents: 8000 },
      { groupId: null, owedCents: 2000 },
    ]);
    // Only the group is checked; the direct slate must not absorb a cent.
    const inserted = await settle(8000, ["goa"]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].groupId).toBe("goa");
    expect(inserted[0].amountCents).toBe(8000);
  });

  it("caps the payment at the selected scopes, not everything owed", async () => {
    vi.mocked(owedByScope).mockResolvedValue([
      { groupId: "goa", owedCents: 8000 },
      { groupId: null, owedCents: 2000 },
    ]);
    // 10k is owed overall, but only the 2k direct slate is selected.
    await expect(settle(5000, [""])).rejects.toThrow(/exceeds what you owe/);
    expect(vi.mocked(insertSettlement)).not.toHaveBeenCalled();
  });

  it("refuses a second settlement once the debt is recorded anywhere", async () => {
    // After the first recording the scopes are empty — whichever page the
    // second attempt comes from, there is nothing left to settle.
    vi.mocked(owedByScope).mockResolvedValue([]);
    await expect(settle(10652)).rejects.toThrow(/don't owe this person anything/);
    expect(vi.mocked(insertSettlement)).not.toHaveBeenCalled();
  });

  it("writes one activity row per portion, each in its scope's voice", async () => {
    vi.mocked(owedByScope).mockResolvedValue([
      { groupId: "goa", owedCents: 8000 },
      { groupId: null, owedCents: 2000 },
    ]);
    await settle(10_000);
    const messages = vi
      .mocked(insertActivity)
      .mock.calls.map(([activity]) => activity.message);
    expect(messages).toEqual([
      'Petra Payer paid Carl Creditor USD 20.00',
      'Petra Payer paid Carl Creditor USD 80.00 in "Group goa"',
    ]);
  });

  it("notifies once, for the whole payment", async () => {
    vi.mocked(owedByScope).mockResolvedValue([
      { groupId: "goa", owedCents: 8000 },
      { groupId: null, owedCents: 2000 },
    ]);
    await settle(10_000);
    expect(vi.mocked(insertNotifications)).toHaveBeenCalledTimes(1);
    const [, notification] = vi.mocked(insertNotifications).mock.calls[0];
    expect(notification.title).toContain("USD 100.00");
  });

  it("every insert goes through the pair lock's client", async () => {
    // The guard reads then writes; a write outside the lock window would
    // reopen the race this design exists to close.
    vi.mocked(owedByScope).mockResolvedValue([{ groupId: "goa", owedCents: 5000 }]);
    await settle(5000);
    for (const call of vi.mocked(insertSettlement).mock.calls) {
      expect(call[1]).toBeDefined();
    }
  });
});

/** Unit tests for who a settlement's activity row is attributed to. */

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
  listGroupsByUser: vi.fn(),
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
  scopeHasSettlements: vi.fn(),
  // The lock is orthogonal to attribution; run the operation directly. The
  // client handed through is never dereferenced by the mocked insert.
  withSettlementPairLock: vi.fn(
    (first: string, second: string, operation: (client: PoolClient) => Promise<unknown>) =>
      operation({} as PoolClient),
  ),
}));
vi.mock("@/server/common/ledgerLocks", () => ({
  lockExpenseLedger: vi.fn(),
  lockGroupLedgers: vi.fn(),
  lockParticipantLedgers: vi.fn(),
  withLedgerTransaction: vi.fn(
    (operation: (client: PoolClient) => Promise<unknown>) => operation({} as PoolClient),
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
import { listGroupsByUser } from "@/server/group/repo/groups.repo";
import { insertSettlement } from "@/server/expense/repo/settlements.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { owedByScope } from "./balance.usecase";

const RECORDER = "user-recorder";
const OTHER = "user-other";

/** The two people involved, keyed by id, as findUserById would return them. */
const PEOPLE: Record<string, { id: string; name: string }> = {
  [RECORDER]: { id: RECORDER, name: "Rita Recorder" },
  [OTHER]: { id: OTHER, name: "Otto Other" },
};

/** Clears every call and re-arms the repo stubs a settlement needs to reach its writes. */
function resetRepos(): void {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockImplementation(
    async (userId: string) => PEOPLE[userId] as Awaited<ReturnType<typeof findUserById>>,
  );
  vi.mocked(listGroupsByUser).mockResolvedValue([]);
  // The whole debt lives in the pair's one-off ledger, comfortably above the
  // amount settled, so the guards pass and a single one-off row is recorded —
  // which is what these attribution tests inspect.
  vi.mocked(owedByScope).mockResolvedValue([{ groupId: null, owedCents: 10_000 }]);
  // Echo the input back as the stored row: the activity fan-out reads the
  // row's scope and amount, so a bare {} would silently test nothing.
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
        created_at: "2026-07-30T00:00:00Z",
      }) as SettlementRow,
  );
  vi.mocked(insertNotifications).mockResolvedValue(undefined);
  vi.mocked(insertActivity).mockResolvedValue(undefined as never);
}

beforeEach(resetRepos);

/**
 * Records a one-off settlement between the two fixture users.
 *
 * @param received - true = the other person paid the recorder.
 * @returns The single argument `insertActivity` was called with.
 */
async function activityFor(received: boolean) {
  await recordSettlement(RECORDER, {
    groupId: "",
    toUserId: OTHER,
    amountCents: 500,
    currency: "USD",
    method: "cash",
    note: "",
    received,
  });
  return vi.mocked(insertActivity).mock.calls[0][0];
}

describe("recordSettlement — activity attribution", () => {
  it("attributes a payment received to the person who paid, not the recorder", async () => {
    // The bug: the feed avatar is drawn from actorId while the message beside
    // it names the payer. Recording "Otto paid me" put Rita's face on a
    // sentence about Otto, which reads as Rita paying herself.
    const activity = await activityFor(true);
    expect(activity.actorId).toBe(OTHER);
    expect(activity.message).toContain("Otto Other paid Rita Recorder");
  });

  it("still attributes an ordinary payment to the person recording it", async () => {
    // Here payer and recorder are the same person, so this is unchanged — it
    // guards against "fixing" the case above by flipping both directions.
    const activity = await activityFor(false);
    expect(activity.actorId).toBe(RECORDER);
    expect(activity.message).toContain("Rita Recorder paid Otto Other");
  });

  it("keeps the avatar and the sentence's subject in agreement either way", async () => {
    // The invariant behind both cases: the actor is whoever the message names
    // first. Stated directly so a future rewording of the message has to keep it.
    for (const received of [true, false]) {
      resetRepos();
      const activity = await activityFor(received);
      expect(activity.message.startsWith(PEOPLE[activity.actorId].name)).toBe(true);
    }
  });

  it("credits whoever received the money, whichever way it moved", async () => {
    // creditUserId drives the inbound/outbound wording in each reader's feed
    // and is deliberately not the actor.
    expect((await activityFor(true)).creditUserId).toBe(RECORDER);
    resetRepos();
    expect((await activityFor(false)).creditUserId).toBe(OTHER);
  });

  it("still tells the other person who entered it", async () => {
    // Moving the avatar to the payer must not lose the recorder — the
    // notification is the only place that information survives.
    await activityFor(true);
    const [, notification] = vi.mocked(insertNotifications).mock.calls[0];
    expect(notification.title).toContain("Rita Recorder recorded your payment");
  });
});

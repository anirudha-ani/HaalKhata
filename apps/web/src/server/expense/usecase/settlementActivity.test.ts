/** Unit tests for who a settlement's activity row is attributed to. */

import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/server/expense/repo/settlements.repo", () => ({ insertSettlement: vi.fn() }));
vi.mock("@/server/social/repo/activity.repo", () => ({
  insertActivity: vi.fn(),
  listActivityForExpense: vi.fn(),
}));
vi.mock("@/server/social/repo/notifications.repo", () => ({ insertNotifications: vi.fn() }));
vi.mock("./balance.usecase", () => ({ amountOwed: vi.fn() }));

import { recordSettlement } from "./expense.usecase";
import { findUserById } from "@/server/auth/repo/users.repo";
import { insertSettlement } from "@/server/expense/repo/settlements.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { amountOwed } from "./balance.usecase";

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
  // Comfortably above the amount settled, so the over-settlement guard passes
  // and execution reaches insertActivity, which is what these tests inspect.
  vi.mocked(amountOwed).mockResolvedValue(10_000);
  vi.mocked(insertSettlement).mockResolvedValue(
    {} as Awaited<ReturnType<typeof insertSettlement>>,
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

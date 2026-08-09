/**
 * Unit tests for setSimplifyDebts: membership gate, persistence, the feed
 * announcement, and idempotence when the mode is already what was asked for.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupRow, MemberRow } from "@/server/group/repo/groups.repo";
import type { UserRow } from "@/server/auth/repo/users.repo";

vi.mock("@/server/group/repo/groups.repo", () => ({
  addMember: vi.fn(),
  findGroupById: vi.fn(),
  insertGroup: vi.fn(),
  isMember: vi.fn(),
  listCoMemberIds: vi.fn(),
  listGroupsByUser: vi.fn(),
  listMembers: vi.fn(),
  listMembersByGroupIds: vi.fn(),
  memberRole: vi.fn(),
  removeMember: vi.fn(),
  updateSimplifyDebts: vi.fn(),
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
vi.mock("@/server/auth/usecase/auth.usecase", () => ({
  findOrCreateUserByEmail: vi.fn(),
  findOrCreateUserByPhone: vi.fn(),
}));
vi.mock("@/server/expense/usecase/balance.usecase", () => ({
  userNetInGroup: vi.fn(),
  userNetInGroups: vi.fn(),
}));

import { setSimplifyDebts } from "./group.usecase";
import {
  findGroupById,
  isMember,
  listMembers,
  updateSimplifyDebts,
} from "@/server/group/repo/groups.repo";
import { findUserById } from "@/server/auth/repo/users.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";

const MEMBER = "user-member";
const OUTSIDER = "user-outsider";
const TRIP = "group-trip";

/** The persisted mode the mocked repo reads and writes. */
let storedSimplify = false;

beforeEach(() => {
  vi.clearAllMocks();
  storedSimplify = false;

  vi.mocked(findGroupById).mockImplementation(
    async () =>
      ({
        id: TRIP,
        name: "Trip",
        type: "trip",
        currency: "USD",
        created_by: MEMBER,
        created_at: "2026-08-01T00:00:00Z",
        simplify_debts: storedSimplify,
      }) as GroupRow,
  );
  vi.mocked(isMember).mockImplementation(async (_groupId, userId) => userId === MEMBER);
  vi.mocked(listMembers).mockResolvedValue([
    { id: MEMBER, name: "Mem Ber", role: "owner" } as MemberRow,
    { id: "user-other", name: "Oth Er", role: "member" } as MemberRow,
  ]);
  vi.mocked(updateSimplifyDebts).mockImplementation(async (_groupId, simplifyValue) => {
    storedSimplify = simplifyValue;
  });
  vi.mocked(findUserById).mockImplementation(
    async (userId: string) => ({ id: userId, name: "Mem Ber" }) as UserRow,
  );
  vi.mocked(insertActivity).mockResolvedValue(undefined as never);
});

describe("setSimplifyDebts", () => {
  it("refuses a non-member", async () => {
    await expect(
      setSimplifyDebts(OUTSIDER, { groupId: TRIP, simplify: true }),
    ).rejects.toThrow(/not a member/);
    expect(updateSimplifyDebts).not.toHaveBeenCalled();
  });

  it("persists the flip and announces it to the whole group", async () => {
    const group = await setSimplifyDebts(MEMBER, { groupId: TRIP, simplify: true });
    expect(updateSimplifyDebts).toHaveBeenCalledWith(TRIP, true);
    expect(group.simplifyDebts).toBe(true);

    // The mode changes what everyone sees and which payments the server
    // accepts, so it must land in the group's feed, addressed to everyone.
    expect(insertActivity).toHaveBeenCalledTimes(1);
    const [activity] = vi.mocked(insertActivity).mock.calls[0];
    expect(activity.message).toContain("turned on debt simplification");
    expect(activity.audience).toEqual([MEMBER, "user-other"]);
  });

  it("setting the state it is already in changes nothing and announces nothing", async () => {
    const group = await setSimplifyDebts(MEMBER, { groupId: TRIP, simplify: false });
    expect(group.simplifyDebts).toBe(false);
    expect(updateSimplifyDebts).not.toHaveBeenCalled();
    expect(insertActivity).not.toHaveBeenCalled();
  });
});

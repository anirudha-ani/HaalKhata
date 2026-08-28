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
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  findUserByPhone: vi.fn(),
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

import { addMembers, createGroup, removeMemberFromGroup, setSimplifyDebts } from "./group.usecase";
import {
  addMember,
  findGroupById,
  insertGroup,
  isMember,
  listCoMemberIds,
  listMembers,
  memberRole,
  removeMember,
  updateSimplifyDebts,
} from "@/server/group/repo/groups.repo";
import { findUserByEmail, findUserById } from "@/server/auth/repo/users.repo";
import { listFriendIds } from "@/server/social/repo/friendships.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { userNetInGroup } from "@/server/expense/usecase/balance.usecase";
import { MAX_GROUP_NAME_LENGTH } from "@/server/group/group.constants";

const MEMBER = "user-member";
const OUTSIDER = "user-outsider";
const TARGET = "user-target";
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
  vi.mocked(listCoMemberIds).mockResolvedValue([]);
  vi.mocked(listFriendIds).mockResolvedValue([]);
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

describe("group membership authorization", () => {
  it("does not let a contact field bypass the connected-user check", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({ id: TARGET } as UserRow);

    await expect(
      addMembers(MEMBER, { groupId: TRIP, email: "target@example.com" }),
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(addMember).not.toHaveBeenCalled();
  });

  it("lets a zero-balance non-owner leave a group", async () => {
    vi.mocked(memberRole).mockResolvedValue("member");
    vi.mocked(userNetInGroup).mockResolvedValue(0);

    await removeMemberFromGroup(MEMBER, { groupId: TRIP, userId: MEMBER });

    expect(removeMember).toHaveBeenCalledWith(TRIP, MEMBER);
  });

  it("still prevents the owner from leaving without transferring ownership", async () => {
    vi.mocked(memberRole).mockResolvedValue("owner");

    await expect(
      removeMemberFromGroup(MEMBER, { groupId: TRIP, userId: MEMBER }),
    ).rejects.toThrow(/transfer ownership/);
    expect(removeMember).not.toHaveBeenCalled();
  });
});

describe("group persisted input bounds", () => {
  it("rejects an oversized group name before insertion", async () => {
    await expect(
      createGroup(MEMBER, {
        name: "G".repeat(MAX_GROUP_NAME_LENGTH + 1),
        type: "trip",
        currency: "USD",
      }),
    ).rejects.toThrow(/group name is too long/);
    expect(insertGroup).not.toHaveBeenCalled();
  });

  it("rejects a malformed currency before insertion", async () => {
    await expect(
      createGroup(MEMBER, { name: "Trip", type: "trip", currency: "USDD" }),
    ).rejects.toThrow(/three-letter code/);
    expect(insertGroup).not.toHaveBeenCalled();
  });
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

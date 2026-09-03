/**
 * Unit tests for setSimplifyDebts: membership gate, persistence, the feed
 * announcement, and idempotence when the mode is already what was asked for.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { GroupRow, MemberRow } from "@/server/group/repo/groups.repo";
import type { UserRow } from "@/server/auth/repo/users.repo";

const { transactionClient } = vi.hoisted(() => ({ transactionClient: {} as PoolClient }));

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
  updateMemberRole: vi.fn(),
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
vi.mock("@/server/common/ledgerLocks", () => ({
  lockGroupLedgers: vi.fn(),
  withLedgerTransaction: vi.fn(
    (operation: (client: PoolClient) => Promise<unknown>) => operation(transactionClient),
  ),
}));

import {
  addMembers,
  createGroup,
  removeMemberFromGroup,
  setSimplifyDebts,
  transferOwnership,
} from "./group.usecase";
import {
  addMember,
  findGroupById,
  insertGroup,
  isMember,
  listCoMemberIds,
  listMembers,
  memberRole,
  removeMember,
  updateMemberRole,
  updateSimplifyDebts,
} from "@/server/group/repo/groups.repo";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import { findOrCreateUserByEmail } from "@/server/auth/usecase/auth.usecase";
import { listFriendIds } from "@/server/social/repo/friendships.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { userNetInGroup } from "@/server/expense/usecase/balance.usecase";
import { lockGroupLedgers } from "@/server/common/ledgerLocks";
import {
  MAX_GROUP_MEMBER_IDS_PER_REQUEST,
  MAX_GROUP_NAME_LENGTH,
} from "@/server/group/group.constants";

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
  it("still denies a REGISTERED unconnected contact typed into the field", async () => {
    // The connected rule protects claimed accounts from debt attribution by
    // strangers; the invite path below is only for rows nobody can sign into.
    vi.mocked(findOrCreateUserByEmail).mockResolvedValue({
      id: "stranger-1",
      google_sub: "google-stranger",
      password_hash: null,
    } as UserRow);

    await expect(
      addMembers(MEMBER, { groupId: TRIP, userIds: [], email: "stranger@example.com" }),
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(addMember).not.toHaveBeenCalled();
  });

  it("creates and enrols an UNREGISTERED contact as Invited (§33)", async () => {
    // No credential means no possible transaction, so enrolling attributes
    // debt to nobody — that is what makes the cold invite safe.
    const invited = {
      id: "invited-1",
      name: "New Person",
      google_sub: null,
      password_hash: null,
    } as UserRow;
    vi.mocked(findOrCreateUserByEmail).mockResolvedValue(invited);
    vi.mocked(findUsersByIds).mockResolvedValue([invited]);

    const result = await addMembers(MEMBER, {
      groupId: TRIP,
      userIds: [],
      email: "new-person@example.com",
    });

    expect(addMember).toHaveBeenCalledWith(TRIP, "invited-1", "member", expect.anything());
    expect(result.added).toHaveLength(1);
  });

  it("lets a zero-balance non-owner leave a group", async () => {
    vi.mocked(memberRole).mockResolvedValue("member");
    vi.mocked(userNetInGroup).mockResolvedValue(0);

    await removeMemberFromGroup(MEMBER, { groupId: TRIP, userId: MEMBER });

    expect(lockGroupLedgers).toHaveBeenCalledWith(transactionClient, [TRIP]);
    expect(userNetInGroup).toHaveBeenCalledWith(MEMBER, TRIP, transactionClient);
    expect(removeMember).toHaveBeenCalledWith(TRIP, MEMBER, transactionClient);
  });

  it("still prevents the owner from leaving without handing the group on", async () => {
    vi.mocked(memberRole).mockResolvedValue("owner");

    await expect(
      removeMemberFromGroup(MEMBER, { groupId: TRIP, userId: MEMBER }),
    ).rejects.toThrow(/make somebody else the owner/);
    expect(removeMember).not.toHaveBeenCalled();
  });
});

describe("transferOwnership", () => {
  beforeEach(() => {
    vi.mocked(findGroupById).mockResolvedValue({ id: TRIP, name: "Trip" } as GroupRow);
    vi.mocked(listMembers).mockResolvedValue([{ id: MEMBER }, { id: TARGET }] as MemberRow[]);
    vi.mocked(findUserById).mockImplementation(
      async (userId: string) => ({ id: userId, name: `Name ${userId}` }) as UserRow,
    );
    vi.mocked(memberRole).mockImplementation(async (_groupId: string, userId: string) =>
      userId === MEMBER ? "owner" : userId === TARGET ? "member" : undefined,
    );
  });

  it("hands the role to another member under the group lock and announces it", async () => {
    await transferOwnership(MEMBER, { groupId: TRIP, userId: TARGET });

    expect(lockGroupLedgers).toHaveBeenCalledWith(transactionClient, [TRIP]);
    expect(updateMemberRole).toHaveBeenCalledWith(TRIP, TARGET, "owner", transactionClient);
    expect(updateMemberRole).toHaveBeenCalledWith(TRIP, MEMBER, "member", transactionClient);
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ownership_transferred",
        audience: [MEMBER, TARGET],
        link: `/groups/${TRIP}`,
      }),
      transactionClient,
    );
  });

  it("is the owner's call alone", async () => {
    await expect(
      transferOwnership(TARGET, { groupId: TRIP, userId: MEMBER }),
    ).rejects.toThrow(/only the group owner/);
    expect(updateMemberRole).not.toHaveBeenCalled();
  });

  it("refuses a target who is not in the group", async () => {
    await expect(
      transferOwnership(MEMBER, { groupId: TRIP, userId: OUTSIDER }),
    ).rejects.toThrow(/not a member/);
    expect(updateMemberRole).not.toHaveBeenCalled();
  });
});

describe("group persisted input bounds", () => {
  it("rejects an oversized create member-id array before any database work", async () => {
    await expect(
      createGroup(MEMBER, {
        name: "Trip",
        type: "trip",
        currency: "USD",
        memberIds: Array.from(
          { length: MAX_GROUP_MEMBER_IDS_PER_REQUEST + 1 },
          (_value, index) => `user-${index}`,
        ),
      }),
    ).rejects.toThrow(/too many members/);
    expect(insertGroup).not.toHaveBeenCalled();
    expect(listFriendIds).not.toHaveBeenCalled();
  });

  it("rejects an oversized add member-id array before loading the group", async () => {
    await expect(
      addMembers(MEMBER, {
        groupId: TRIP,
        userIds: Array(MAX_GROUP_MEMBER_IDS_PER_REQUEST + 1).fill(TARGET),
      }),
    ).rejects.toThrow(/too many members/);
    expect(findGroupById).not.toHaveBeenCalled();
    expect(addMember).not.toHaveBeenCalled();
  });

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
    expect(lockGroupLedgers).toHaveBeenCalledWith(transactionClient, [TRIP]);
    expect(updateSimplifyDebts).toHaveBeenCalledWith(TRIP, true, transactionClient);
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

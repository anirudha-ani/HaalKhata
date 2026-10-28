/**
 * Unit tests for group membership, debt routing and archiving: authorization,
 * locked balance checks, persistence, announcements and idempotence.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { GroupStatus } from "@haalkhata/protogen/group/v1/group_pb";
import { GROUP_STATUS_STORAGE, type GroupStatusValue } from "@/server/group/group.constants";
import type { GroupRow, MemberRow } from "@/server/group/repo/groups.repo";
import type { UserRow } from "@/server/auth/repo/users.repo";

const { transactionClient } = vi.hoisted(() => ({ transactionClient: {} as PoolClient }));

vi.mock("@/server/safety/repo/safety.repo", () => ({ blockedBetween: vi.fn(async () => false), blockedPairExists: vi.fn(async () => false) }));

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
  updateGroupStatus: vi.fn(),
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
vi.mock("@/server/expense/usecase/balance.usecase", () => ({
  memberDebtsInGroup: vi.fn(),
  userNetInGroup: vi.fn(),
  userNetInGroups: vi.fn(),
  groupIsSettled: vi.fn(),
}));
vi.mock("@/server/common/ledger/ledgerLocks", () => ({
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
  setStatus,
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
  updateGroupStatus,
} from "@/server/group/repo/groups.repo";
import { findUserByEmail, findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import { listFriendIds } from "@/server/social/repo/friendships.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { groupIsSettled, memberDebtsInGroup, userNetInGroup } from "@/server/expense/usecase/balance.usecase";
import { lockGroupLedgers } from "@/server/common/ledger/ledgerLocks";
import { DEFAULT_READ_MAX_BYTES } from "@/server/api/connect/connect.constants";
import {
  MAX_GROUP_MEMBER_IDS_PER_REQUEST,
  MAX_GROUP_NAME_LENGTH,
} from "@/server/group/group.constants";

const MEMBER = "user-member";
const OUTSIDER = "user-outsider";
const TARGET = "user-target";
const TRIP = "group-trip";
/** How long refusing a hostile email may take; the old pattern took seconds at this size. */
const HOSTILE_EMAIL_BUDGET_MS = 100;

/** The persisted mode the mocked repo reads and writes. */
let storedSimplify = false;
/** Archive state persisted by the mocked repository. */
let storedStatus: GroupStatusValue = "active";

beforeEach(() => {
  vi.clearAllMocks();
  storedSimplify = false;
  storedStatus = "active";
  vi.mocked(groupIsSettled).mockResolvedValue(true);
  vi.mocked(updateGroupStatus).mockImplementation(async (_groupId, status) => {
    storedStatus = status;
  });

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
        status: storedStatus,
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
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "stranger-1",
      google_sub: "google-stranger",
      password_hash: null,
    } as UserRow);

    await expect(
      addMembers(MEMBER, { groupId: TRIP, userIds: [], email: "stranger@example.com" }),
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(addMember).not.toHaveBeenCalled();
  });

  it("refuses a contact with no account, pointing at the group's link (§33c)", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(undefined);

    await expect(
      addMembers(MEMBER, { groupId: TRIP, userIds: [], email: "new-person@example.com" }),
    ).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringContaining("share this group's invite link"),
    });
    expect(addMember).not.toHaveBeenCalled();
  });

  it("refuses enrolling a Deleted member left in a friend's history (§33c)", async () => {
    const standIn = {
      id: "stand-in-1",
      name: "Deleted member",
      google_sub: null,
      password_hash: null,
      deleted_at: "2026-10-01T00:00:00Z",
    } as UserRow;
    vi.mocked(listFriendIds).mockResolvedValue(["stand-in-1"]);
    vi.mocked(findUsersByIds).mockResolvedValue([standIn]);

    await expect(
      addMembers(MEMBER, { groupId: TRIP, userIds: ["stand-in-1"], email: "" }),
    ).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringContaining("Deleted member can't be added to a group"),
    });
    expect(addMember).not.toHaveBeenCalled();
  });

  it("lets a non-owner no debt names leave a group", async () => {
    vi.mocked(memberRole).mockResolvedValue("member");
    vi.mocked(memberDebtsInGroup).mockResolvedValue([]);

    await removeMemberFromGroup(MEMBER, { groupId: TRIP, userId: MEMBER });

    expect(lockGroupLedgers).toHaveBeenCalledWith(transactionClient, [TRIP]);
    expect(memberDebtsInGroup).toHaveBeenCalledWith(MEMBER, TRIP, transactionClient);
    expect(removeMember).toHaveBeenCalledWith(TRIP, MEMBER, transactionClient);
  });

  it("keeps a member in while a debt still names them, whatever their total", async () => {
    vi.mocked(memberRole).mockResolvedValue("member");
    vi.mocked(memberDebtsInGroup).mockResolvedValue([
      { currency: "USD", fromUserId: "user-ben", toUserId: MEMBER, amountCents: 5000 },
    ]);

    await expect(removeMemberFromGroup(MEMBER, { groupId: TRIP, userId: MEMBER })).rejects.toThrow(
      /outstanding balance/,
    );
    expect(removeMember).not.toHaveBeenCalled();
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

  it("refuses an email field the size of a whole request at once, before looking anybody up", async () => {
    // Shaped to make a backtracking email pattern try every split of the dots.
    const hostile = `a@${".".repeat(DEFAULT_READ_MAX_BYTES)}@`;
    const start = performance.now();
    await expect(
      addMembers(MEMBER, { groupId: TRIP, userIds: [], email: hostile }),
    ).rejects.toMatchObject({ code: "invalid_argument" });

    expect(performance.now() - start).toBeLessThan(HOSTILE_EMAIL_BUDGET_MS);
    expect(findUserByEmail).not.toHaveBeenCalled();
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


describe("setStatus", () => {
  it("allows an ordinary member to archive a settled group under the ledger lock", async () => {
    vi.mocked(memberRole).mockResolvedValue("member");
    const group = await setStatus(MEMBER, { groupId: TRIP, status: GroupStatus.ARCHIVED });
    expect(group.status).toBe(GroupStatus.ARCHIVED);
    expect(lockGroupLedgers).toHaveBeenCalledWith(transactionClient, [TRIP]);
    expect(findGroupById).toHaveBeenCalledWith(TRIP, transactionClient);
    expect(isMember).toHaveBeenCalledWith(TRIP, MEMBER, transactionClient);
    expect(groupIsSettled).toHaveBeenCalledWith(TRIP, transactionClient);
    expect(updateGroupStatus).toHaveBeenCalledWith(TRIP, "archived", transactionClient);
    expect(vi.mocked(lockGroupLedgers).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(groupIsSettled).mock.invocationCallOrder[0],
    );
  });

  it("rejects archiving when anyone in the group still has an outstanding balance", async () => {
    vi.mocked(userNetInGroup).mockResolvedValue(new Map());
    vi.mocked(groupIsSettled).mockResolvedValue(false);
    await expect(setStatus(MEMBER, { groupId: TRIP, status: GroupStatus.ARCHIVED })).rejects.toMatchObject({
      code: "failed_precondition",
    });
    expect(updateGroupStatus).not.toHaveBeenCalled();
  });

  it.each([GroupStatus.ARCHIVED, GroupStatus.ACTIVE])("denies non-members requesting status=%s", async (status) => {
    await expect(setStatus(OUTSIDER, { groupId: TRIP, status })).rejects.toMatchObject({
      code: "permission_denied",
    });
    expect(groupIsSettled).not.toHaveBeenCalled();
    expect(updateGroupStatus).not.toHaveBeenCalled();
    expect(lockGroupLedgers).not.toHaveBeenCalled();
  });

  it("rechecks membership when it changed while waiting for the group lock", async () => {
    vi.mocked(lockGroupLedgers).mockImplementationOnce(async () => {
      vi.mocked(isMember).mockResolvedValue(false);
    });
    await expect(setStatus(MEMBER, { groupId: TRIP, status: GroupStatus.ARCHIVED })).rejects.toMatchObject({
      code: "permission_denied",
    });
    expect(groupIsSettled).not.toHaveBeenCalled();
    expect(updateGroupStatus).not.toHaveBeenCalled();
  });

  it("rejects a missing group", async () => {
    vi.mocked(findGroupById).mockResolvedValue(undefined);
    await expect(setStatus(MEMBER, { groupId: TRIP, status: GroupStatus.ARCHIVED })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(updateGroupStatus).not.toHaveBeenCalled();
  });

  it.each([GroupStatus.UNSPECIFIED, GroupStatus.DELETED, 999 as GroupStatus])(
    "rejects unsupported lifecycle status %s before touching the ledger",
    async (status) => {
      await expect(setStatus(MEMBER, { groupId: TRIP, status })).rejects.toMatchObject({
        code: "invalid_argument",
      });
      expect(lockGroupLedgers).not.toHaveBeenCalled();
      expect(updateGroupStatus).not.toHaveBeenCalled();
    },
  );

  it("cannot restore a group marked deleted through the archive control", async () => {
    storedStatus = "deleted";
    await expect(setStatus(MEMBER, { groupId: TRIP, status: GroupStatus.ACTIVE })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(updateGroupStatus).not.toHaveBeenCalled();
  });

  it("restores the group for any member without needing a balance check", async () => {
    storedStatus = "archived";
    const group = await setStatus(MEMBER, { groupId: TRIP, status: GroupStatus.ACTIVE });
    expect(group.status).toBe(GroupStatus.ACTIVE);
    expect(updateGroupStatus).toHaveBeenCalledWith(TRIP, "active", transactionClient);
    expect(groupIsSettled).not.toHaveBeenCalled();
  });

  it.each([GroupStatus.ARCHIVED, GroupStatus.ACTIVE] as const)("repeating status=%s is a no-op", async (status) => {
    storedStatus = GROUP_STATUS_STORAGE[status];
    const group = await setStatus(MEMBER, { groupId: TRIP, status });
    expect(group.status).toBe(status);
    expect(updateGroupStatus).not.toHaveBeenCalled();
    expect(groupIsSettled).not.toHaveBeenCalled();
  });
});

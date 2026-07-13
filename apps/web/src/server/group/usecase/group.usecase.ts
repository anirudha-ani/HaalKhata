/** Group business logic: create/list/get, add-by-email (shadow users), balance-guarded member removal. */

import {
  addMember,
  findGroupById,
  insertGroup,
  isMember,
  listGroupsByUser,
  listMembers,
  removeMember,
} from "@/server/group/repo/groups.repo";
import { findUserById } from "@/server/auth/repo/users.repo";
import { insertFriendship } from "@/server/social/repo/friendships.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { findOrCreateUserByEmail } from "@/server/auth/usecase/auth.usecase";
import { userNetInGroup } from "@/server/expense/usecase/balance.usecase";
import { denied, invalid, notFound } from "@/server/common/errors";
import { GROUP_TYPES } from "@/server/group/group.constants";
import { toGroup, toMember } from "./group.mapper";

/**
 * Creates a group owned by the caller and records a "group_created" activity
 * event visible to the creator.
 *
 * @param userId - Id of the authenticated user creating the group.
 * @param input - Requested group name (trimmed), category type (coerced to
 *   "other" when unrecognized), and currency (falls back to the creator's
 *   default currency, then "USD").
 * @returns The new group as a group.v1 message shape, including its members.
 * @throws UsecaseError (invalid_argument) when the trimmed name is empty.
 */
export async function createGroup(
  userId: string,
  input: { name: string; type: string; currency: string },
) {
  const name = input.name.trim();
  if (name.length === 0) invalid("group name is required");
  const type = GROUP_TYPES.has(input.type) ? input.type : "other";
  const currency =
    input.currency || (await findUserById(userId))?.default_currency || "USD";
  const group = await insertGroup({ name, type, currency, createdBy: userId });

  const actor = (await findUserById(userId))!;
  await insertActivity({
    groupId: group.id,
    actorId: userId,
    type: "group_created",
    message: `${actor.name} created the group "${name}"`,
    link: `/groups/${group.id}`,
    audience: [userId],
  });
  return toGroup(group, await listMembers(group.id));
}

/**
 * Lists the caller's groups, newest first, each with its member list, member
 * count, and the caller's net balance in that group.
 *
 * @param userId - Id of the authenticated user whose groups to list.
 * @returns One entry per group: the mapped group, its member count, and the
 *   caller's net position in cents (positive = owed to the caller).
 */
export async function listGroups(userId: string) {
  const groups = await listGroupsByUser(userId);
  return Promise.all(
    groups.map(async (group) => {
      const [members, yourNetCents] = await Promise.all([
        listMembers(group.id),
        userNetInGroup(userId, group.id),
      ]);
      return {
        group: toGroup(group, members),
        memberCount: members.length,
        yourNetCents,
      };
    }),
  );
}

/**
 * Fetches a single group, including members, for a caller who belongs to it.
 *
 * @param userId - Id of the authenticated caller.
 * @param groupId - Id of the group to fetch.
 * @returns The group as a group.v1 message shape with its members.
 * @throws UsecaseError (not_found) when the group does not exist.
 * @throws UsecaseError (permission_denied) when the caller is not a member.
 */
export async function getGroup(userId: string, groupId: string) {
  const group = await findGroupById(groupId);
  if (!group) notFound("group not found");
  if (!(await isMember(groupId, userId))) denied("you are not a member of this group");
  return toGroup(group, await listMembers(groupId));
}

/**
 * Adds a user to a group by email, creating a shadow user when no account
 * exists. Also befriends the caller with the new member, records a
 * "member_added" activity event for all members, and notifies the added user.
 *
 * @param userId - Id of the authenticated caller performing the add.
 * @param input - Target group id, the invitee's email, and an optional
 *   display name used when a shadow user must be created.
 * @returns The added member as a group.v1 Member message shape.
 * @throws UsecaseError (not_found) when the group does not exist.
 * @throws UsecaseError (permission_denied) when the caller is not a member.
 * @throws UsecaseError (invalid_argument) when the user is already a member.
 */
export async function addMemberByEmail(
  userId: string,
  input: { groupId: string; email: string; name?: string },
) {
  const group = await findGroupById(input.groupId);
  if (!group) notFound("group not found");
  if (!(await isMember(input.groupId, userId))) {
    denied("you are not a member of this group");
  }

  const user = await findOrCreateUserByEmail(input.email, input.name);
  if (await isMember(input.groupId, user.id)) {
    invalid(`${user.name} is already in this group`);
  }
  await addMember(input.groupId, user.id);
  await insertFriendship(userId, user.id);

  const actor = (await findUserById(userId))!;
  const audience = (await listMembers(input.groupId)).map((member) => member.id);
  await insertActivity({
    groupId: input.groupId,
    actorId: userId,
    type: "member_added",
    message: `${actor.name} added ${user.name} to "${group.name}"`,
    link: `/groups/${input.groupId}`,
    audience,
  });
  await insertNotifications(
    [user.id].filter((recipientId) => recipientId !== userId),
    {
      type: "added_to_group",
      title: `${actor.name} added you to "${group.name}"`,
      body: "",
      link: `/groups/${input.groupId}`,
    },
  );
  return toMember({ ...user, role: "member" });
}

/**
 * Removes a member from a group, but only when that member's net balance in
 * the group is settled (exactly zero).
 *
 * @param userId - Id of the authenticated caller requesting the removal.
 * @param input - The group id and the id of the member to remove.
 * @throws UsecaseError (not_found) when the group does not exist.
 * @throws UsecaseError (permission_denied) when the caller is not a member.
 * @throws UsecaseError (invalid_argument) when the member still has an
 *   outstanding balance in the group.
 */
export async function removeMemberFromGroup(
  userId: string,
  input: { groupId: string; userId: string },
) {
  const group = await findGroupById(input.groupId);
  if (!group) notFound("group not found");
  if (!(await isMember(input.groupId, userId))) {
    denied("you are not a member of this group");
  }
  if ((await userNetInGroup(input.userId, input.groupId)) !== 0) {
    invalid("cannot remove a member with an outstanding balance — settle up first");
  }
  await removeMember(input.groupId, input.userId);
}

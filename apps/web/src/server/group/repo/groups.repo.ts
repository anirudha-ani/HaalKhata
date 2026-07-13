/** All SQL for the groups and group_members tables. */

import { execute, newId, query, queryOne, transaction } from "@/server/common/db";
import type { UserRow } from "@/server/auth/repo/users.repo";

/** A row from the groups table (column names mirror SQL). */
export interface GroupRow {
  id: string;
  name: string;
  /** Group category: "trip" | "home" | "couple" | "other". */
  type: string;
  /** ISO 4217 currency code used for the group's expenses. */
  currency: string;
  /** User id of the group's creator (also its initial owner). */
  created_by: string;
  created_at: string;
}

/** A group member: the user row joined with their group_members role. */
export type MemberRow = UserRow & { role: string };

/**
 * Creates a group and enrolls its creator as the "owner" member, atomically.
 *
 * @param input - Group attributes: display name, category type, currency
 *   code, and the creating user's id.
 * @returns The freshly inserted group row.
 */
export async function insertGroup(input: {
  name: string;
  type: string;
  currency: string;
  createdBy: string;
}): Promise<GroupRow> {
  const groupId = newId();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO groups (id, name, type, currency, created_by) VALUES ($1, $2, $3, $4, $5)`,
      [groupId, input.name, input.type, input.currency, input.createdBy],
    );
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [groupId, input.createdBy],
    );
  });
  return (await findGroupById(groupId))!;
}

/**
 * Looks up a single group by primary key.
 *
 * @param groupId - Id of the group to fetch.
 * @returns The group row, or undefined when no group has that id.
 */
export async function findGroupById(groupId: string): Promise<GroupRow | undefined> {
  return queryOne<GroupRow>(`SELECT * FROM groups WHERE id = $1`, [groupId]);
}

/**
 * Lists every group the given user belongs to, newest first.
 *
 * @param userId - Id of the user whose memberships to look up.
 * @returns Group rows ordered by creation time descending.
 */
export async function listGroupsByUser(userId: string): Promise<GroupRow[]> {
  return query<GroupRow>(
    `SELECT groups.* FROM groups
     JOIN group_members ON group_members.group_id = groups.id
     WHERE group_members.user_id = $1
     ORDER BY groups.created_at DESC`,
    [userId],
  );
}

/**
 * Lists a group's members (user rows plus their role), oldest joiner first.
 *
 * @param groupId - Id of the group whose members to fetch.
 * @returns Member rows ordered by join time ascending.
 */
export async function listMembers(groupId: string): Promise<MemberRow[]> {
  return query<MemberRow>(
    `SELECT users.*, group_members.role FROM users
     JOIN group_members ON group_members.user_id = users.id
     WHERE group_members.group_id = $1
     ORDER BY group_members.joined_at ASC`,
    [groupId],
  );
}

/**
 * Adds a user to a group; a no-op if the membership already exists.
 *
 * @param groupId - Id of the group to add the user to.
 * @param userId - Id of the user being added.
 * @param role - Membership role to record (defaults to "member").
 */
export async function addMember(
  groupId: string,
  userId: string,
  role = "member",
): Promise<void> {
  await execute(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [groupId, userId, role],
  );
}

/**
 * Deletes a user's membership in a group (no error if it does not exist).
 *
 * @param groupId - Id of the group to remove the user from.
 * @param userId - Id of the user being removed.
 */
export async function removeMember(groupId: string, userId: string): Promise<void> {
  await execute(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [
    groupId,
    userId,
  ]);
}

/**
 * Checks whether a user is currently a member of a group.
 *
 * @param groupId - Id of the group to check.
 * @param userId - Id of the user whose membership is being checked.
 * @returns True when a membership row exists.
 */
export async function isMember(groupId: string, userId: string): Promise<boolean> {
  const membershipRow = await queryOne(
    `SELECT 1 AS matched FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
  );
  return membershipRow !== undefined;
}

/**
 * Fetches a member's role in a group (e.g. "owner" or "member").
 *
 * @param groupId - Id of the group to check.
 * @param userId - Id of the user whose role is being fetched.
 * @returns The role string, or undefined when the user is not a member.
 */
export async function memberRole(groupId: string, userId: string): Promise<string | undefined> {
  const roleRow = await queryOne<{ role: string }>(
    `SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
  );
  return roleRow?.role;
}

/** Group business logic: create/list/get, connected-member enrollment, balance-guarded removal. */

import {
  addMember,
  findGroupById,
  insertGroup,
  isMember,
  listCoMemberIds,
  listGroupsByUser,
  listMembers,
  listMembersByGroupIds,
  memberRole,
  removeMember,
  updateSimplifyDebts,
} from "@/server/group/repo/groups.repo";
import type { UserRow } from "@/server/auth/repo/users.repo";
import {
  findUserByEmail,
  findUserById,
  findUserByPhone,
  findUsersByIds,
} from "@/server/auth/repo/users.repo";
import { insertFriendship, listFriendIds } from "@/server/social/repo/friendships.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { userNetInGroup, userNetInGroups } from "@/server/expense/usecase/balance.usecase";
import { denied, invalid, notFound } from "@/server/common/errors";
import { normalizeCurrencyCode } from "@/server/common/validation";
import { EMAIL_PATTERN, normalizePhone, PHONE_FORMAT_HINT } from "@/server/auth/auth.constants";
import { GROUP_TYPES, MAX_GROUP_NAME_LENGTH, OWNER_ROLE } from "@/server/group/group.constants";
import { toGroup, toMember } from "./group.mapper";

/**
 * Loads a group and asserts the caller is its owner; used for owner-only
 * actions like removing a member.
 *
 * @param groupId - Id of the group to load.
 * @param userId - Id of the authenticated caller.
 * @returns The loaded group row.
 * @throws UsecaseError (not_found) when the group does not exist.
 * @throws UsecaseError (permission_denied) when the caller is not the owner.
 */
async function assertGroupOwner(groupId: string, userId: string) {
  const group = await findGroupById(groupId);
  if (!group) notFound("group not found");
  const role = await memberRole(groupId, userId);
  if (role !== OWNER_ROLE) denied("only the group owner can do this");
  return group;
}

/**
 * Loads a group and asserts the caller belongs to it.
 *
 * Adding people is a member action, not an owner one. A group is a shared
 * ledger, and whoever notices that somebody is missing from the dinner is
 * rarely the person who happened to create the group — routing every addition
 * through one account makes them a bottleneck for a change anyone present can
 * see is correct. Removal stays owner-only: it is the destructive direction,
 * and it is already gated on a settled balance.
 *
 * @param groupId - Id of the group to load.
 * @param userId - Id of the authenticated caller.
 * @returns The loaded group row.
 * @throws UsecaseError (not_found) when the group does not exist.
 * @throws UsecaseError (permission_denied) when the caller is not a member.
 */
async function assertGroupMember(groupId: string, userId: string) {
  const group = await findGroupById(groupId);
  if (!group) notFound("group not found");
  if (!(await isMember(groupId, userId))) denied("you are not a member of this group");
  return group;
}

/**
 * The set of people a caller may enrol in a group: everyone they have an
 * explicit friendship with, plus everyone they already share a group with.
 *
 * The second half is not redundant. Friendships are symmetric, but two people
 * who met as members of somebody else's group have no friendship row between
 * them — and `listFriends` still offers them to each other once they share an
 * expense. Guarding on friendship alone would show a name in the picker that
 * the server then refuses to accept.
 *
 * @param userId - Id of the caller doing the adding.
 * @returns Ids the caller is allowed to add to a group.
 */
async function connectedUserIds(userId: string): Promise<Set<string>> {
  const [friendIds, coMemberIds] = await Promise.all([
    listFriendIds(userId),
    listCoMemberIds(userId),
  ]);
  return new Set([...friendIds, ...coMemberIds]);
}

/**
 * Renders names as a sentence fragment: "Rifat", "Rifat and Tanvir", "Rifat,
 * Tanvir and Sadia". Used for the one activity line a batch add writes.
 *
 * @param names - Display names in the order they should read.
 * @returns The joined phrase, or "" when given nothing.
 */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Asserts the caller may enrol every one of these ids.
 *
 * @param callerId - Id of the authenticated caller doing the adding.
 * @param userIds - User ids to authorize, including contact-resolved ids.
 * @throws UsecaseError (permission_denied) when an id is somebody the caller
 *   neither has as a friend nor shares a group with.
 */
async function assertCanAdd(callerId: string, userIds: string[]): Promise<void> {
  const requestedIds = userIds.filter((userId) => userId !== "" && userId !== callerId);
  if (requestedIds.length === 0) return;
  const allowedIds = await connectedUserIds(callerId);
  for (const userId of requestedIds) {
    if (!allowedIds.has(userId)) {
      denied("you can only add people you already share a friendship or a group with");
    }
  }
}

/**
 * Enrols people in a group: skips anyone already in, adds the rest, and
 * befriends the caller with each of them.
 *
 * Authorization is the caller's job ({@link assertCanAdd}). Already-members
 * are skipped rather than rejected so one stale
 * checkbox cannot lose the rest of the batch; whether an empty result is an
 * error differs between creating and adding, so that is decided upstream too.
 *
 * @param callerId - Id of the authenticated caller doing the adding.
 * @param groupId - Group to enrol people into.
 * @param userIds - Candidate user ids, duplicates tolerated.
 * @returns The user rows actually added, in the order the ids were given.
 */
async function enrollMembers(
  callerId: string,
  groupId: string,
  userIds: string[],
): Promise<UserRow[]> {
  const requestedIds = [...new Set(userIds)].filter((userId) => userId !== "");
  if (requestedIds.length === 0) return [];

  const existingIds = new Set((await listMembers(groupId)).map((member) => member.id));
  const newIds = requestedIds.filter((userId) => !existingIds.has(userId));
  const usersById = new Map(
    (await findUsersByIds(newIds)).map((userRow) => [userRow.id, userRow] as const),
  );

  const added: UserRow[] = [];
  for (const userId of newIds) {
    const user = usersById.get(userId);
    // An id with no row is a client sending something stale, not an attack —
    // the authorization check above already passed, so just skip it.
    if (!user) continue;
    await addMember(groupId, userId);
    await insertFriendship(callerId, userId);
    added.push(user);
  }
  return added;
}

/**
 * Resolves an optional email/phone to an existing account. Cold invites are
 * deliberately rejected: without an acceptance flow, creating a shadow row
 * would let the caller enrol a stranger who never consented.
 *
 * @param input - The raw email and phone fields, plus an optional display
 *   name for a shadow user. Both empty means nobody was invited.
 * @returns The invited user row, or undefined when neither field was given.
 * @throws UsecaseError (invalid_argument) when both fields are populated.
 */
async function resolveInvitee(input: {
  email?: string;
  phone?: string;
  name?: string;
}): Promise<UserRow | undefined> {
  const email = (input.email ?? "").trim();
  const phone = (input.phone ?? "").trim();
  if (email !== "" && phone !== "") {
    invalid("enter either an email address or a phone number, not both");
  }
  let invitee: UserRow | undefined;
  if (email !== "") {
    if (!EMAIL_PATTERN.test(email)) invalid("please enter a valid email address");
    invitee = await findUserByEmail(email);
  }
  if (phone !== "") {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) invalid(PHONE_FORMAT_HINT);
    invitee = await findUserByPhone(normalizedPhone);
  }
  if ((email !== "" || phone !== "") && !invitee) {
    denied("you can only add people you already share a friendship or a group with");
  }
  if (invitee) return invitee;
  return undefined;
}

/**
 * Creates a group owned by the caller and records a "group_created" activity
 * event visible to the creator.
 *
 * @param userId - Id of the authenticated user creating the group.
 * @param input - Requested group name (trimmed), category type (coerced to
 *   "other" when unrecognized), currency (falls back to the creator's default
 *   currency, then "USD"), and the ids of anyone to enrol alongside them.
 * @returns The new group as a group.v1 message shape, including its members.
 * @throws UsecaseError (invalid_argument) when the trimmed name is empty.
 * @throws UsecaseError (permission_denied) when a member id is somebody the
 *   creator neither has as a friend nor shares a group with.
 */
export async function createGroup(
  userId: string,
  input: { name: string; type: string; currency: string; memberIds?: string[] },
) {
  const name = input.name.trim();
  if (name.length === 0) invalid("group name is required");
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    invalid(`group name is too long (max ${MAX_GROUP_NAME_LENGTH} characters)`);
  }
  const type = GROUP_TYPES.has(input.type) ? input.type : "other";
  const currency = normalizeCurrencyCode(
    input.currency || (await findUserById(userId))?.default_currency || "USD",
  );
  // Authorize before the insert, so a rejected member list does not leave an
  // orphan group behind.
  await assertCanAdd(userId, input.memberIds ?? []);
  const group = await insertGroup({ name, type, currency, createdBy: userId });
  const added = await enrollMembers(userId, group.id, input.memberIds ?? []);

  const actor = (await findUserById(userId))!;
  // Everyone enrolled at creation sees the event, so a group appearing in
  // their list is explained by their feed rather than showing up unannounced.
  // No separate "added" event: at creation the two are the same act.
  await insertActivity({
    groupId: group.id,
    actorId: userId,
    type: "group_created",
    message: `${actor.name} created the group "${name}"`,
    link: `/groups/${group.id}`,
    audience: [userId, ...added.map((user) => user.id)],
  });
  await notifyAdded(actor, group.id, name, added);
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
  const groupIds = groups.map((group) => group.id);
  const [membersByGroup, netByGroup] = await Promise.all([
    listMembersByGroupIds(groupIds),
    userNetInGroups(userId, groupIds),
  ]);
  return groups.map((group) => ({
    group: toGroup(group, membersByGroup.get(group.id) ?? []),
    memberCount: (membersByGroup.get(group.id) ?? []).length,
    yourNetCents: netByGroup.get(group.id) ?? 0,
  }));
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
 * Tells newly added people they are in a group. Skips the actor, who does not
 * need to be told about their own action.
 *
 * @param actor - The user row of whoever did the adding.
 * @param groupId - Group they were added to.
 * @param groupName - That group's display name, for the notification title.
 * @param added - The user rows that were actually added.
 */
async function notifyAdded(
  actor: UserRow,
  groupId: string,
  groupName: string,
  added: UserRow[],
): Promise<void> {
  const recipientIds = added
    .map((user) => user.id)
    .filter((recipientId) => recipientId !== actor.id);
  if (recipientIds.length === 0) return;
  await insertNotifications(recipientIds, {
    type: "added_to_group",
    title: `${actor.name} added you to "${groupName}"`,
    body: "",
    link: `/groups/${groupId}`,
  });
}

/**
 * Adds connected people to a group in one call, by id or by an email/phone
 * that resolves to an existing connected account. Befriends the caller with
 * everyone added, writes a single
 * "member_added" activity event naming them all, and notifies each of them.
 *
 * One event for the batch rather than one per person: a feed that reports a
 * single action three times is noise.
 *
 * Open to any member, not just the owner — see {@link assertGroupMember}.
 *
 * @param userId - Id of the authenticated caller performing the add.
 * @param input - Target group id, ids of people to add, and an optional
 *   email/phone (at most one) identifying an existing connected account.
 * @returns `{ added }` — the people actually added, as Member message shapes.
 * @throws UsecaseError (not_found) when the group does not exist.
 * @throws UsecaseError (permission_denied) when the caller is not a member,
 *   or an id is somebody they neither have as a friend nor share a group with.
 * @throws UsecaseError (invalid_argument) when both email and phone are given,
 *   or when nobody was picked, or when everybody picked is already a member.
 */
export async function addMembers(
  userId: string,
  input: {
    groupId: string;
    userIds?: string[];
    email?: string;
    phone?: string;
    name?: string;
  },
) {
  const group = await assertGroupMember(input.groupId, userId);

  const pickedIds = input.userIds ?? [];
  const invitee = await resolveInvitee(input);
  const candidateIds = [...pickedIds, ...(invitee ? [invitee.id] : [])];
  if (candidateIds.length === 0) invalid("pick somebody to add");
  await assertCanAdd(userId, candidateIds);

  const added = await enrollMembers(userId, input.groupId, candidateIds);
  if (added.length === 0) {
    // Nothing happened, and silently reporting success would leave the modal
    // looking like it worked. The singular case is the common one: you typed
    // the email of somebody already in the group.
    invalid(
      candidateIds.length === 1
        ? "they're already in this group"
        : "everybody you picked is already in this group",
    );
  }

  const actor = (await findUserById(userId))!;
  const audience = (await listMembers(input.groupId)).map((member) => member.id);
  await insertActivity({
    groupId: input.groupId,
    actorId: userId,
    type: "member_added",
    message: `${actor.name} added ${nameList(added.map((user) => user.name))} to "${group.name}"`,
    link: `/groups/${input.groupId}`,
    audience,
  });
  await notifyAdded(actor, input.groupId, group.name, added);
  return { added: added.map((user) => toMember({ ...user, role: "member" })) };
}

/**
 * Turns debt simplification on or off for a group.
 *
 * Member-level, like adding people: it is a shared ledger and this is a
 * routing mode over balances that stay fully derived, so flipping it rewrites
 * nothing and is always reversible. It still changes what everyone sees and
 * which payments the settlement guards accept, so the change is announced in
 * the group's feed rather than happening silently.
 *
 * Setting the state the group is already in is a no-op that skips the feed
 * entry — two members flipping the switch together should not produce a
 * duplicate announcement or an error.
 *
 * @param userId - Id of the authenticated caller flipping the mode.
 * @param input - The group id and the desired state.
 * @returns The group (with members) after the change.
 * @throws UsecaseError (not_found) when the group does not exist.
 * @throws UsecaseError (permission_denied) when the caller is not a member.
 */
export async function setSimplifyDebts(
  userId: string,
  input: { groupId: string; simplify: boolean },
) {
  const group = await assertGroupMember(input.groupId, userId);
  if (group.simplify_debts !== input.simplify) {
    await updateSimplifyDebts(input.groupId, input.simplify);
    const actor = (await findUserById(userId))!;
    const audience = (await listMembers(input.groupId)).map((member) => member.id);
    await insertActivity({
      groupId: input.groupId,
      actorId: userId,
      type: "simplify_debts",
      message: input.simplify
        ? `${actor.name} turned on debt simplification in "${group.name}" — fewer payments, same balances`
        : `${actor.name} turned off debt simplification in "${group.name}" — debts show person to person again`,
      link: `/groups/${input.groupId}`,
      audience,
    });
  }
  return toGroup((await findGroupById(input.groupId))!, await listMembers(input.groupId));
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
  if (input.userId === userId) {
    const role = await memberRole(input.groupId, userId);
    if (!role) denied("you are not a member of this group");
    if (role === OWNER_ROLE) invalid("owners cannot remove themselves; transfer ownership first");
  } else {
    await assertGroupOwner(input.groupId, userId);
  }
  if ((await userNetInGroup(input.userId, input.groupId)) !== 0) {
    invalid("cannot remove a member with an outstanding balance — settle up first");
  }
  await removeMember(input.groupId, input.userId);
}

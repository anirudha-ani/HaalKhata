/** Social business logic: friends (friendships ∪ expense counterparties), activity feed, notifications. */

import { insertFriendship, listFriendIds } from "@/server/social/repo/friendships.repo";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import { listActivityForGroup, listActivityForUser } from "@/server/social/repo/activity.repo";
import { isMember } from "@/server/group/repo/groups.repo";
import {
  countUnread,
  listNotificationsByUser,
  markAllRead,
} from "@/server/social/repo/notifications.repo";
import { findOrCreateUserByEmail } from "@/server/auth/usecase/auth.usecase";
import { getOverallBalances } from "@/server/expense/usecase/balance.usecase";
import { denied, invalid } from "@/server/common/errors";
import { toUser } from "@/server/auth/usecase/user.mapper";

/**
 * Befriends the caller with the user behind the given email, creating a
 * shadow user when no account exists.
 *
 * @param userId - Id of the authenticated caller adding the friend.
 * @param input - The friend's email, plus an optional display name used when
 *   a shadow user must be created.
 * @returns The friend as a user.v1 User message shape.
 * @throws UsecaseError (invalid_argument) when the email is the caller's own.
 */
export async function addFriend(userId: string, input: { email: string; name?: string }) {
  const friend = await findOrCreateUserByEmail(input.email, input.name);
  if (friend.id === userId) invalid("that's your own email");
  await insertFriendship(userId, friend.id);
  return toUser(friend);
}

/**
 * Lists the caller's friends: expense counterparties (with their net
 * balances) first, then remaining explicit friendships alphabetically with a
 * zero balance.
 *
 * @param userId - Id of the authenticated caller whose friends to list.
 * @returns Entries of `{ user, netCents }` where positive netCents means the
 *   friend owes the caller.
 */
export async function listFriends(userId: string) {
  const { counterparties } = await getOverallBalances(userId);
  const seenUserIds = new Set(counterparties.map((counterparty) => counterparty.user.id));
  const remainingFriendIds = (await listFriendIds(userId)).filter(
    (friendId) => !seenUserIds.has(friendId),
  );
  const remainingFriends = await findUsersByIds(remainingFriendIds);
  return [
    ...counterparties,
    ...remainingFriends
      .sort((firstUser, secondUser) => firstUser.name.localeCompare(secondUser.name))
      .map((friendUser) => ({ user: toUser(friendUser), netCents: 0 })),
  ];
}

/**
 * Lists activity feed events, either the caller's personal feed (events
 * whose audience includes them) or a single group's feed. Events whose actor
 * no longer resolves to a user are dropped.
 *
 * @param userId - Id of the authenticated caller reading the feed.
 * @param groupId - When set, restricts the feed to this group.
 * @returns Feed events as social.v1 ActivityEvent message shapes, newest
 *   first.
 * @throws UsecaseError (permission_denied) when groupId is set but the
 *   caller is not a member of that group.
 */
export async function listActivity(userId: string, groupId?: string) {
  if (groupId && !(await isMember(groupId, userId))) {
    denied("you are not a member of this group");
  }
  const activityRows = groupId
    ? await listActivityForGroup(groupId)
    : await listActivityForUser(userId);
  const actors = new Map(
    (
      await findUsersByIds([...new Set(activityRows.map((activityRow) => activityRow.actor_id))])
    ).map((actorUser) => [actorUser.id, actorUser]),
  );
  return activityRows.flatMap((activityRow) => {
    const actor = actors.get(activityRow.actor_id);
    if (!actor) return [];
    return [
      {
        id: activityRow.id,
        groupId: activityRow.group_id ?? "",
        actor: toUser(actor),
        type: activityRow.type,
        message: activityRow.message,
        link: activityRow.link,
        createdAt: activityRow.created_at,
      },
    ];
  });
}

/**
 * Lists the caller's newest notifications along with their unread count.
 *
 * @param userId - Id of the authenticated caller.
 * @returns The notifications as social.v1 Notification message shapes plus
 *   the number still unread.
 */
export async function listNotifications(userId: string) {
  const [notifications, unreadCount] = await Promise.all([
    listNotificationsByUser(userId),
    countUnread(userId),
  ]);
  return {
    notifications: notifications.map((notificationRow) => ({
      id: notificationRow.id,
      type: notificationRow.type,
      title: notificationRow.title,
      body: notificationRow.body,
      link: notificationRow.link,
      read: notificationRow.read_at !== null,
      createdAt: notificationRow.created_at,
    })),
    unreadCount,
  };
}

/**
 * Marks every one of the caller's notifications as read.
 *
 * @param userId - Id of the authenticated caller.
 */
export async function markNotificationsRead(userId: string): Promise<void> {
  await markAllRead(userId);
}

/**
 * Asserts that the given user id still resolves to an account.
 *
 * @param userId - Id of the user whose existence to verify.
 * @throws UsecaseError (permission_denied) when the account no longer exists.
 */
export async function assertUserExists(userId: string): Promise<void> {
  if (!(await findUserById(userId))) denied("account no longer exists");
}

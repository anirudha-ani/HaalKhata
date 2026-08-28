/** Social business logic: friends (friendships ∪ expense counterparties), activity feed, notifications. */

import { insertFriendship, listFriendIds } from "@/server/social/repo/friendships.repo";
import {
  findUserByEmail,
  findUserById,
  findUserByPhone,
  findUsersByIds,
  type UserRow,
} from "@/server/auth/repo/users.repo";
import { listActivityMonths, listActivityPage } from "@/server/social/repo/activity.repo";
import { isMember, listCoMemberIds } from "@/server/group/repo/groups.repo";
import {
  countUnread,
  findLatestNotificationAt,
  insertNotifications,
  listNotificationsByUser,
  markAllRead,
} from "@/server/social/repo/notifications.repo";
import {
  ACTIVITY_PAGE_SIZE,
  MAX_ACTIVITY_PAGE_SIZE,
  REMINDER_COOLDOWN_HOURS,
} from "@/server/social/social.constants";
import { formatMoney } from "@haalkhata/shared/money/money";
import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import { findPaymentMethod } from "@haalkhata/shared/payment/methods";
import { getOverallBalances, netWithUser } from "@/server/expense/usecase/balance.usecase";
import { denied, invalid, notFound } from "@/server/common/errors";
import { toPublicUser } from "@/server/auth/usecase/user.mapper";
import { EMAIL_PATTERN, normalizePhone, PHONE_FORMAT_HINT } from "@/server/auth/auth.constants";

/**
 * Befriends the caller with an existing fellow group member identified by id,
 * email, or phone. Contact lookup is only an alternate identifier: it does not
 * create accounts and cannot bypass the shared-group authorization check.
 *
 * For email/phone, exactly one identifier must be supplied — clients present
 * a single "email or phone" field and route the raw string with
 * `splitIdentifier`, so both being set means a client bug rather than user
 * input worth guessing at.
 *
 * @param userId - Id of the authenticated caller adding the friend.
 * @param input - The friend's user id, or their email or phone (exactly one
 *   non-empty). The legacy name field is ignored.
 * @returns The friend as a user.v1 User message shape.
 * @throws UsecaseError (invalid_argument) when neither or both identifiers are
 *   given, the identifier is malformed, or it resolves to the caller;
 *   (permission_denied) when the target is absent or does not share a group.
 */
export async function addFriend(
  userId: string,
  input: { email: string; phone: string; name?: string; userId?: string },
) {
  // By id: befriending someone already on screen — a fellow group member —
  // without retyping contact details. Gated on actually sharing a group,
  // because a guessed or leaked id must not be enough to attach yourself to
  // a stranger's ledger; membership is the introduction.
  const targetId = input.userId?.trim() ?? "";
  if (targetId !== "") {
    if (targetId === userId) invalid("that's your own account");
    const target = await findUserById(targetId);
    if (!target) notFound("user not found");
    if (!(await listCoMemberIds(userId)).includes(targetId)) {
      denied("you can only add someone you share a group with this way");
    }
    await insertFriendship(userId, targetId);
    return toPublicUser(target);
  }

  const email = input.email.trim();
  const phone = input.phone.trim();
  if (email === "" && phone === "") invalid("enter an email address or phone number");
  if (email !== "" && phone !== "") {
    invalid("enter either an email address or a phone number, not both");
  }
  let friend: UserRow | undefined;
  if (email) {
    if (!EMAIL_PATTERN.test(email)) invalid("please enter a valid email address");
    friend = await findUserByEmail(email);
  } else {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) invalid(PHONE_FORMAT_HINT);
    friend = await findUserByPhone(normalizedPhone);
  }
  const coMemberIds = await listCoMemberIds(userId);
  if (!friend || !coMemberIds.includes(friend.id)) {
    denied("you can only add someone you share a group with");
  }
  if (friend.id === userId) invalid("that's your own account");
  await insertFriendship(userId, friend.id);
  return toPublicUser(friend);
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
      .map((friendUser) => ({ user: toPublicUser(friendUser), netCents: 0 })),
  ];
}

/**
 * Lists one page of activity feed events, either the caller's personal feed
 * (events whose audience includes them) or a single group's. Events whose
 * actor no longer resolves to a user are dropped.
 *
 * `inbound` is resolved here rather than stored, because the same settlement
 * row is money arriving for one reader and money leaving for the other.
 *
 * @param userId - Id of the authenticated caller reading the feed.
 * @param options - `groupId` restricts to one group; `cursor` continues a
 *   previous page; `limit` is the page size (clamped); `month` ("YYYY-MM")
 *   restricts to one calendar month.
 * @returns The events newest first, the cursor for the next page (empty when
 *   exhausted), and the months that contain activity in this scope.
 * @throws UsecaseError (permission_denied) when groupId is set but the
 *   caller is not a member of that group.
 */
export async function listActivity(
  userId: string,
  options: { groupId?: string; cursor?: string; limit?: number; month?: string } = {},
) {
  const groupId = options.groupId;
  if (groupId && !(await isMember(groupId, userId))) {
    denied("you are not a member of this group");
  }
  // The viewer rides along in both scopes: a group id narrows the feed to
  // one group, but what the viewer may see is always the audience's call.
  const scope = groupId ? { userId, groupId } : { userId };
  const limit = Math.min(
    Math.max(options.limit && options.limit > 0 ? options.limit : ACTIVITY_PAGE_SIZE, 1),
    MAX_ACTIVITY_PAGE_SIZE,
  );

  const [page, months] = await Promise.all([
    listActivityPage(scope, { limit, cursor: options.cursor ?? "", month: options.month ?? "" }),
    listActivityMonths(scope),
  ]);

  const actors = new Map(
    (await findUsersByIds([...new Set(page.rows.map((activityRow) => activityRow.actor_id))])).map(
      (actorUser) => [actorUser.id, actorUser],
    ),
  );

  return {
    events: page.rows.flatMap((activityRow) => {
      const actor = actors.get(activityRow.actor_id);
      if (!actor) return [];
      return [
        {
          id: activityRow.id,
          groupId: activityRow.group_id ?? "",
          actor: toPublicUser(actor),
          type: activityRow.type,
          message: activityRow.message,
          link: safeActivityPath(activityRow.link),
          createdAt: activityRow.created_at,
          amountCents: activityRow.amount_cents,
          currency: activityRow.currency,
          inbound: activityRow.credit_user_id === userId,
        },
      ];
    }),
    nextCursor: page.nextCursor,
    months,
  };
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

/**
 * Nudges someone who owes the caller money, as an in-app notification that
 * includes the caller's payment handles so the debtor knows where to send it.
 *
 * Two guards, both server-side because the client is not the party that
 * suffers when they are missing: you can only remind somebody who actually
 * owes you right now, and only once per {@link REMINDER_COOLDOWN_HOURS}. The
 * previous reminder is its own cooldown record — no extra table needed.
 *
 * @param userId - Id of the authenticated caller sending the reminder.
 * @param debtorId - Id of the person being reminded.
 * @throws UsecaseError when reminding yourself, when they owe you nothing, or
 *   while the cooldown is still running.
 */
export async function sendReminder(userId: string, debtorId: string): Promise<void> {
  if (debtorId === userId) invalid("you cannot remind yourself");
  const debtor = await findUserById(debtorId);
  if (!debtor) denied("account no longer exists");

  const link = `/friends/${userId}`;
  const lastSentAt = await findLatestNotificationAt(debtorId, "reminder", link);
  if (lastSentAt) {
    const elapsedHours = (Date.now() - new Date(lastSentAt).getTime()) / 3_600_000;
    if (elapsedHours < REMINDER_COOLDOWN_HOURS) {
      invalid(
        `you already reminded ${debtor.name} — you can send another in ${Math.ceil(
          REMINDER_COOLDOWN_HOURS - elapsedHours,
        )}h`,
      );
    }
  }

  // A rejected cooldown is one indexed lookup. Only callers who may actually
  // send another reminder pay for the full expense-and-settlement ledger walk.
  const netCents = await netWithUser(userId, debtorId);
  if (netCents <= 0) invalid("they don't owe you anything right now");

  const sender = (await findUserById(userId))!;

  // The nudge carries the sender's handles, because "where do I send it?" is
  // the very next question and making the debtor ask defeats the reminder.
  const payTo = (sender.payment_handles ?? [])
    .filter((entry) => entry.handle)
    .map((entry) => {
      const method = findPaymentMethod(entry.method);
      return `${method?.label ?? entry.method}: ${entry.handle}`;
    })
    .join(" · ");
  const owed = formatMoney(netCents, sender.default_currency || "USD");

  await insertNotifications([debtorId], {
    type: "reminder",
    title: `${sender.name} sent you a reminder`,
    body: payTo ? `You owe ${owed} — pay via ${payTo}` : `You owe ${owed}`,
    link,
  });
}

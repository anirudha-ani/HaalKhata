/** Social business logic: friends (friendships ∪ expense counterparties), activity feed, notifications. */

import {
  deleteFriendRequest,
  friendshipExists,
  insertFriendRequest,
  insertFriendship,
  listFriendIds,
  listIncomingFriendRequestIds,
} from "@/server/social/repo/friendships.repo";
import {
  findUserByEmail,
  findUserById,
  findUserByPhone,
  findUsersByIds,
  type UserRow,
} from "@/server/auth/repo/users.repo";
import { listActivityMonths, listActivityPage } from "@/server/social/repo/activity.repo";
import { isMember } from "@/server/group/repo/groups.repo";
import { lockReminder, withLedgerTransaction } from "@/server/common/ledgerLocks";
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
import { transaction } from "@/server/common/db";
import { toFriendRequestUser, toPublicUser } from "@/server/auth/usecase/user.mapper";
import { EMAIL_PATTERN, normalizePhone, PHONE_FORMAT_HINT } from "@/server/auth/auth.constants";

/**
 * Sends a friend request to an existing account identified by id, email, or
 * phone. Every syntactically valid lookup receives the same empty response,
 * whether or not an account exists, so this RPC cannot enumerate identities.
 * No friendship exists until the recipient accepts.
 *
 * For email/phone, exactly one identifier must be supplied — clients present
 * a single "email or phone" field and route the raw string with
 * `splitIdentifier`, so both being set means a client bug rather than user
 * input worth guessing at.
 *
 * @param userId - Id of the authenticated caller adding the friend.
 * @param input - The friend's user id, or their email or phone (exactly one
 *   non-empty). The legacy name field is ignored.
 * @returns An intentionally empty User-shaped acknowledgement.
 * @throws UsecaseError (invalid_argument) when the request does not contain
 *   exactly one identifier or when that identifier is malformed.
 */
export async function addFriend(
  userId: string,
  input: { email: string; phone: string; name?: string; userId?: string },
) {
  const targetId = input.userId?.trim() ?? "";
  const email = input.email.trim();
  const phone = input.phone.trim();
  const suppliedIdentifiers = [targetId, email, phone].filter(
    (identifier) => identifier !== "",
  );
  if (suppliedIdentifiers.length !== 1) {
    invalid("enter exactly one user id, email address, or phone number");
  }

  let friend: UserRow | undefined;
  if (targetId) {
    friend = await findUserById(targetId);
  } else if (email) {
    if (!EMAIL_PATTERN.test(email)) invalid("please enter a valid email address");
    friend = await findUserByEmail(email);
  } else {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) invalid(PHONE_FORMAT_HINT);
    friend = await findUserByPhone(normalizedPhone);
  }

  // Missing, self, duplicate, and newly-created requests are deliberately
  // indistinguishable to the caller. Only the recipient learns that a real
  // request exists, through their private request list and notification.
  if (
    !friend ||
    friend.id === userId ||
    friend.merged_into !== null ||
    (await friendshipExists(userId, friend.id))
  ) {
    return {};
  }
  const requester = await findUserById(userId);
  if (!requester) return {};
  await transaction(async (client) => {
    const inserted = await insertFriendRequest(userId, friend.id, client);
    if (!inserted) return;
    await insertNotifications(
      [friend.id],
      {
        type: "friend_request",
        title: `${requester.name} sent you a friend request`,
        body: "Accept or decline it from Friends.",
        link: "/friends",
      },
      client,
    );
  });
  return {};
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
  const [{ counterparties }, incomingRequestIds] = await Promise.all([
    getOverallBalances(userId),
    listIncomingFriendRequestIds(userId),
  ]);
  const seenUserIds = new Set(counterparties.map((counterparty) => counterparty.user.id));
  const remainingFriendIds = (await listFriendIds(userId)).filter(
    (friendId) => !seenUserIds.has(friendId),
  );
  const [remainingFriends, incomingRequesters] = await Promise.all([
    findUsersByIds(remainingFriendIds),
    findUsersByIds(incomingRequestIds),
  ]);
  const requesterById = new Map(
    incomingRequesters
      .filter((requester) => requester.merged_into === null)
      .map((requester) => [requester.id, requester]),
  );
  return {
    friends: [
      ...counterparties,
      ...remainingFriends
        .sort((firstUser, secondUser) => firstUser.name.localeCompare(secondUser.name))
        .map((friendUser) => ({ user: toPublicUser(friendUser), netCents: 0, balances: [] })),
    ],
    incomingRequests: incomingRequestIds.flatMap((requesterId) => {
      const requester = requesterById.get(requesterId);
      return requester ? [toFriendRequestUser(requester)] : [];
    }),
  };
}

/**
 * Accepts or declines a request addressed to the authenticated recipient.
 * Acceptance consumes the request and creates both friendship rows in the
 * same transaction; declining only consumes it.
 *
 * @param userId - Authenticated request recipient.
 * @param requesterId - Account that sent the incoming request.
 * @param accept - Whether to establish the friendship or decline it.
 * @throws UsecaseError (not_found) when no matching incoming request exists.
 */
export async function respondFriendRequest(
  userId: string,
  requesterId: string,
  accept: boolean,
): Promise<void> {
  if (!requesterId || requesterId === userId) notFound("friend request not found");
  const recipient = accept ? await findUserById(userId) : undefined;
  await transaction(async (client) => {
    if (!(await deleteFriendRequest(requesterId, userId, client))) {
      notFound("friend request not found");
    }
    if (!accept) return;
    await insertFriendship(userId, requesterId, client);
    if (!recipient) return;
    await insertNotifications(
      [requesterId],
      {
        type: "friend_request",
        title: `${recipient.name} accepted your friend request`,
        body: "You can now split one-off expenses together.",
        link: "/friends",
      },
      client,
    );
  });
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
  const sender = (await findUserById(userId))!;
  // The cooldown check and the insert it guards run on one transaction
  // behind an advisory lock on the (sender, debtor) pair: without it, ten
  // concurrent sends all read "no previous reminder" before any commits,
  // and the cooldown exists precisely to stop that.
  await withLedgerTransaction(async (client) => {
    await lockReminder(client, userId, debtorId);
    const lastSentAt = await findLatestNotificationAt(debtorId, "reminder", link, client);
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
    // Per currency: the nudge names each amount in its own currency, and a
    // dollar they owe is not cancelled by a euro they are owed.
    const owedBuckets = [...(await netWithUser(userId, debtorId)).entries()].filter(
      ([, cents]) => cents > 0,
    );
    if (owedBuckets.length === 0) invalid("they don't owe you anything right now");

    // The nudge carries the sender's handles, because "where do I send it?" is
    // the very next question and making the debtor ask defeats the reminder.
    const payTo = (sender.payment_handles ?? [])
      .filter((entry) => entry.handle)
      .map((entry) => {
        const method = findPaymentMethod(entry.method);
        return `${method?.label ?? entry.method}: ${entry.handle}`;
      })
      .join(" · ");
    const owed = owedBuckets.map(([currency, cents]) => formatMoney(cents, currency)).join(" and ");

    await insertNotifications(
      [debtorId],
      {
        type: "reminder",
        title: `${sender.name} sent you a reminder`,
        body: payTo ? `You owe ${owed} — pay via ${payTo}` : `You owe ${owed}`,
        link,
      },
      client,
    );
  });
}

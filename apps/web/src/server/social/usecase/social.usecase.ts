/** Social business logic: friends (friendships ∪ expense counterparties), activity feed, notifications. */

import { blockedBetween, blockedPairExists } from "@/server/safety/repo/safety.repo";
import {
  countIncomingFriendRequests,
  deleteFriendRequest,
  deleteFriendship,
  deleteOutgoingFriendRequest,
  friendshipExists,
  insertFriendRequest,
  insertFriendship,
  listFriendIds,
  listIncomingFriendRequestIds,
  listOutgoingFriendRequests,
} from "@/server/social/repo/friendships.repo";
import { randomBytes } from "node:crypto";
import {
  findUserByEmail,
  findUserById,
  findUserByPhone,
  findUsersByIds,
  type UserRow,
} from "@/server/auth/repo/users.repo";
import { EMAIL_PATTERN, normalizePhone, PHONE_FORMAT_HINT } from "@/server/auth/auth.constants";
import {
  findActiveGroupLink,
  findActiveLinkByToken,
  findActiveProfileLink,
  insertInviteLink,
  revokeGroupLinks,
  revokeProfileLinks,
  type InviteLinkRow,
} from "@/server/social/repo/inviteLinks.repo";
import {
  addMember,
  findGroupById,
  listMembers,
  memberRole,
} from "@/server/group/repo/groups.repo";
import { insertActivity as recordActivity } from "@/server/social/repo/activity.repo";
import { MAX_GROUP_MEMBERS, OWNER_ROLE } from "@/server/group/group.constants";
import { listActivityMonths, listActivityPage } from "@/server/social/repo/activity.repo";
import { isMember } from "@/server/group/repo/groups.repo";
import { isUniqueViolation } from "@/server/common/db/db";
import { lockReminder, withLedgerTransaction } from "@/server/common/ledger/ledgerLocks";
import {
  countUnread,
  findLatestNotificationAt,
  insertNotifications,
  listNotificationsByUser,
  markAllRead,
} from "@/server/social/repo/notifications.repo";
import {
  ACTIVITY_PAGE_SIZE,
  INVITE_LINK_TOKEN_BYTES,
  INVITE_LINK_TOKEN_PATTERN,
  MAX_ACTIVITY_PAGE_SIZE,
  NOT_ON_HAALKHATA_MESSAGE,
  REMINDER_COOLDOWN_HOURS,
} from "@/server/social/social.constants";
import {
  lockFriendRequestInboxes,
  lockGroupLedgers,
  lockParticipantLedgers,
} from "@/server/common/ledger/ledgerLocks";
import { formatMoney } from "@haalkhata/shared/money/money";
import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import { listPaymentMethodsByUser } from "@/server/payment/repo/paymentMethods.repo";
import { reminderPaymentHint } from "@/server/payment/usecase/paymentHint";
import { cleanMethodRow } from "@/server/payment/usecase/paymentMethod.mapper";
import { getOverallBalances, netWithUser } from "@/server/expense/usecase/balance.usecase";
import { denied, invalid, notFound, UsecaseError } from "@/server/common/errors";
import { transaction } from "@/server/common/db/db";
import { toFriendRequestUser, toPublicUser } from "@/server/auth/usecase/identity/user.mapper";
import { friendRequestNotice } from "@/server/social/usecase/friendRequestNotice";

/**
 * Adds a friend by id, email, or phone, as a friend request: nothing exists
 * until they accept, and the caller's response stays empty, so self,
 * duplicate and pending requests are indistinguishable.
 *
 * Only somebody who has signed up can be added, and nothing is created for
 * an email or phone that matches nobody: the person is reached through the
 * caller's own invite link and signs up as themselves.
 *
 * Deliberate trade-off, direction over §21's strict oracle: an email or
 * phone with no account is refused out loud, which reveals whether it has
 * one. A refusal the caller can act on (share the link instead) won; the
 * rate limit and this note remain.
 *
 * @param userId - Id of the authenticated caller adding the friend.
 * @param input - The friend's user id, or their email or phone (exactly one
 *   non-empty). The legacy name field is ignored.
 * @returns An intentionally empty User-shaped acknowledgement.
 * @throws UsecaseError (invalid_argument) when the request does not contain
 *   exactly one identifier or when that identifier is malformed.
 * @throws UsecaseError (failed_precondition) when the email or phone belongs
 *   to nobody on HaalKhata.
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
    // Picked from a list the caller was shown; a stale id is not worth a refusal.
    friend = await findUserById(targetId);
    if (!friend) return {};
  } else {
    friend = await findUserByIdentifier(email, phone);
    if (!friend) throw new UsecaseError("failed_precondition", NOT_ON_HAALKHATA_MESSAGE);
  }

  if (friend.id === userId) return {};
  if (await blockedBetween(userId, friend.id)) return {};
  if (await friendshipExists(userId, friend.id)) {
    return {};
  }
  const requester = await findUserById(userId);
  if (!requester) return {};
  // Kept on the row so the sender's list can echo what they typed. A
  // recipient chosen by id was already on their screen, so nothing is kept
  // and their minimal profile is shown instead.
  const typedIdentifier = email || phone || undefined;
  await transaction(async (client) => {
    const inserted = await insertFriendRequest(userId, friend.id, client, typedIdentifier);
    if (!inserted) return;
    await insertNotifications(
      [friend.id],
      { actorId: userId, ...friendRequestNotice(requester.name) },
      client,
    );
  });
  return {};
}

/**
 * Finds the account an email or phone belongs to, after checking its shape.
 *
 * @param email - Typed email, or empty when a phone was given.
 * @param phone - Typed phone in any format, or empty when an email was given.
 * @returns The account, or undefined when nobody on HaalKhata has it.
 * @throws UsecaseError (invalid_argument) when the identifier is malformed.
 */
async function findUserByIdentifier(email: string, phone: string): Promise<UserRow | undefined> {
  if (email) {
    if (!EMAIL_PATTERN.test(email.toLowerCase())) invalid("please enter a valid email address");
    return findUserByEmail(email);
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) invalid(PHONE_FORMAT_HINT);
  return findUserByPhone(normalizedPhone);
}

/**
 * One request the caller sent and is still waiting on, as the wire shape
 * expects it: exactly one of `user` / `identifier` is set.
 */
interface OutgoingFriendRequestEntry {
  /** Minimal profile of a recipient picked by id or reached through a link. */
  user?: ReturnType<typeof toFriendRequestUser>;
  /** The email or phone the caller typed, echoed back as typed. */
  identifier?: string;
  /** When the request was sent. */
  createdAt: string;
}

/**
 * Lists the caller's friends: expense counterparties (with their net
 * balances) first, then remaining explicit friendships alphabetically with a
 * zero balance. Pending requests ride along in both directions.
 *
 * A sent request echoes only what the caller already knew: the email or
 * phone they typed, or the minimal profile of a recipient they picked by id
 * or reached through a profile link. A typed identifier is never resolved to
 * the account behind it, or sending a request would double as a lookup.
 *
 * @param userId - Id of the authenticated caller whose friends to list.
 * @returns `friends` as `{ user, netCents }` where positive netCents means
 *   the friend owes the caller; `incomingRequests` awaiting the caller;
 *   `outgoingRequests` the caller is waiting on, oldest first.
 */
export async function listFriends(userId: string) {
  const [{ counterparties }, incomingRequestIds, outgoingRequests] = await Promise.all([
    getOverallBalances(userId),
    listIncomingFriendRequestIds(userId),
    listOutgoingFriendRequests(userId),
  ]);
  const seenUserIds = new Set(counterparties.map((counterparty) => counterparty.user.id));
  const remainingFriendIds = (await listFriendIds(userId)).filter(
    (friendId) => !seenUserIds.has(friendId),
  );
  // Only recipients picked by id or link are looked up; a typed identifier
  // is echoed as typed.
  const pickedRecipientIds = outgoingRequests
    .filter((request) => request.recipient_identifier === null)
    .map((request) => request.recipient_id);
  const [remainingFriends, incomingRequesters, pickedRecipients] = await Promise.all([
    findUsersByIds(remainingFriendIds),
    findUsersByIds(incomingRequestIds),
    findUsersByIds(pickedRecipientIds),
  ]);
  const requesterById = new Map(
    incomingRequesters.map((requester) => [requester.id, requester]),
  );
  const recipientById = new Map(
    pickedRecipients.map((recipient) => [recipient.id, recipient]),
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
    outgoingRequests: outgoingRequests.flatMap((request): OutgoingFriendRequestEntry[] => {
      if (request.recipient_identifier !== null) {
        return [{ identifier: request.recipient_identifier, createdAt: request.created_at }];
      }
      const recipient = recipientById.get(request.recipient_id);
      return recipient
        ? [{ user: toFriendRequestUser(recipient), createdAt: request.created_at }]
        : [];
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
  if (accept && await blockedBetween(userId, requesterId)) notFound("friend request not found");
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
        actorId: userId,
        title: `${recipient.name} accepted your friend request`,
        body: "You can now split one-off expenses together.",
        link: "/friends",
      },
      client,
    );
  });
}

/**
 * Withdraws a pending request the caller sent. The request is named the way
 * the caller saw it in `outgoing_requests`: by the recipient's id when they
 * were picked, or by the identifier typed when they were not, so cancelling
 * never requires (or reveals) the account behind an email or phone. The
 * recipient is not told; the request simply stops being pending.
 *
 * @param userId - Authenticated requester.
 * @param input - Exactly one of the recipient's id or the typed identifier.
 * @throws UsecaseError (invalid_argument) unless exactly one of them is given.
 * @throws UsecaseError (not_found) when no such pending request exists,
 *   including one the recipient answered a moment ago.
 */
export async function cancelFriendRequest(
  userId: string,
  input: { userId: string; identifier: string },
): Promise<void> {
  const recipientId = input.userId.trim();
  const identifier = input.identifier.trim();
  if ((recipientId === "") === (identifier === "")) {
    invalid("name the request by exactly one of the person or the identifier you typed");
  }
  if (recipientId === userId) notFound("friend request not found");
  const removed = await deleteOutgoingFriendRequest(
    userId,
    recipientId ? { recipientId } : { recipientIdentifier: identifier },
  );
  if (!removed) notFound("that request is no longer pending");
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
 * Lists the caller's newest notifications along with their unread count and
 * the number of friend requests awaiting their answer. The latter lives here
 * because clients already poll this call for the bell badge, and ListFriends
 * is far too heavy to poll for one number.
 *
 * @param userId - Id of the authenticated caller.
 * @returns The notifications as social.v1 Notification message shapes, the
 *   number still unread, and the pending incoming friend request count.
 */
export async function listNotifications(userId: string) {
  const [notifications, unreadCount, pendingFriendRequestCount] = await Promise.all([
    listNotificationsByUser(userId),
    countUnread(userId),
    countIncomingFriendRequests(userId),
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
    pendingFriendRequestCount,
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

/** One generic sentence for every unusable token: missing, revoked, malformed. */
const DEAD_LINK_MESSAGE = "that invite link isn't valid or was turned off";

/** Mints a fresh bearer token for an invite link. */
function newInviteToken(): string {
  return randomBytes(INVITE_LINK_TOKEN_BYTES).toString("base64url");
}

/**
 * The group's one active join link, created on first ask. Any member may —
 * the same trust level as adding people directly, and the accept side still
 * shows who invited whom.
 *
 * @param userId - Authenticated caller; must be a member.
 * @param groupId - Group the link joins people into.
 * @returns The link's bearer token.
 */
export async function createGroupInviteLink(
  userId: string,
  groupId: string,
): Promise<{ token: string }> {
  const group = await findGroupById(groupId);
  if (!group) notFound("group not found");
  if (!(await isMember(groupId, userId))) denied("you are not a member of this group");

  const existing = await findActiveGroupLink(groupId);
  if (existing) return { token: existing.token };
  const token = newInviteToken();
  try {
    await insertInviteLink({ token, kind: "group", inviterId: userId, groupId });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await findActiveGroupLink(groupId);
    if (winner) return { token: winner.token };
    throw error;
  }
  return { token };
}

/**
 * The caller's own shareable "add me" link, minted on first ask.
 *
 * @param userId - The profile's owner.
 * @returns The link's bearer token.
 */
export async function getProfileInviteLink(userId: string): Promise<{ token: string }> {
  const existing = await findActiveProfileLink(userId);
  if (existing) return { token: existing.token };
  const token = newInviteToken();
  try {
    await insertInviteLink({
      token,
      kind: "profile",
      inviterId: userId,
      groupId: null,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await findActiveProfileLink(userId);
    if (winner) return { token: winner.token };
    throw error;
  }
  return { token };
}

/**
 * Disables the caller's profile link; the next ask mints a fresh one — the
 * remedy when a link escaped further than intended.
 *
 * @param userId - The profile's owner.
 */
export async function revokeProfileInviteLink(userId: string): Promise<void> {
  await revokeProfileLinks(userId);
}

/**
 * Disables the group's active join link. Owner only: revocation kills a
 * link every member may have already shared, which is the destructive
 * direction — the same line drawn for removing members.
 *
 * @param userId - Authenticated caller; must be the owner.
 * @param groupId - Group whose link is disabled.
 */
export async function revokeGroupInviteLink(userId: string, groupId: string): Promise<void> {
  const group = await findGroupById(groupId);
  if (!group) notFound("group not found");
  if ((await memberRole(groupId, userId)) !== OWNER_ROLE) {
    denied("only the group owner can turn off the invite link");
  }
  await revokeGroupLinks(groupId);
}

/**
 * What a clicked link offers — who invited you, to what — for the landing
 * page to show BEFORE anyone signs in. Unauthenticated: possession of the
 * unguessable token is the credential, and every unusable token gets the
 * same sentence so the endpoint scans as nothing.
 *
 * @param token - The token from the shared URL.
 * @returns Inviter and target details for the landing page.
 */
export async function previewInviteLink(token: string) {
  const link = await loadActiveLink(token);
  const inviter = await findUserById(link.inviter_id);
  if (link.kind === "group") {
    const group = await findGroupById(link.group_id!);
    if (!group) notFound(DEAD_LINK_MESSAGE);
    const members = await listMembers(group.id);
    return {
      kind: "group",
      inviterName: inviter?.name ?? "Someone",
      groupName: group.name,
      memberCount: members.length,
      invitedName: "",
    };
  }
  // A profile link speaks for its owner; once they are gone it offers nothing.
  if (!inviter) notFound(DEAD_LINK_MESSAGE);
  return {
    kind: "profile",
    inviterName: inviter.name,
    groupName: "",
    memberCount: 0,
    invitedName: "",
  };
}

/**
 * Resolves a presented token to its live link, with one generic refusal for
 * every dead shape.
 *
 * @param token - The token from the shared URL.
 * @returns The active link row.
 */
async function loadActiveLink(token: string): Promise<InviteLinkRow> {
  if (!INVITE_LINK_TOKEN_PATTERN.test(token)) notFound(DEAD_LINK_MESSAGE);
  const link = await findActiveLinkByToken(token);
  if (!link) notFound(DEAD_LINK_MESSAGE);
  return link;
}

/**
 * Accepts an invite link as the signed-in caller. Nothing is claimed or
 * merged: the caller joins as the account they signed in with.
 *
 * Profile link: sends the owner an ordinary friend request.
 *
 * Group link: enrols the caller (idempotently), befriends them with the
 * inviter, and announces the join in the group's feed so a new face is
 * explained.
 *
 * @param userId - Authenticated acceptor.
 * @param token - The token from the shared URL.
 * @returns The joined group's id for group links; empty otherwise.
 */
export async function acceptInviteLink(
  userId: string,
  token: string,
): Promise<{ groupId: string }> {
  const link = await loadActiveLink(token);
  if (await blockedBetween(userId, link.inviter_id)) notFound(DEAD_LINK_MESSAGE);
  const acceptor = await findUserById(userId);
  if (!acceptor) denied("account no longer exists");
  if (link.inviter_id === userId && link.kind === "profile") {
    invalid("that's your own invite link");
  }

  if (link.kind === "profile") {
    // The link removes the typing, not the consent: acceptance is an
    // ordinary friend request the owner confirms from Friends, so a leaked
    // bearer string cannot attach a stranger to somebody's expense picker.
    if (await friendshipExists(userId, link.inviter_id)) return { groupId: "" };
    await transaction(async (client) => {
      const inserted = await insertFriendRequest(userId, link.inviter_id, client);
      if (!inserted) return;
      await insertNotifications(
        [link.inviter_id],
        {
          actorId: userId,
          type: "friend_request",
          title: `${acceptor.name} wants to connect`,
          body: "They used your profile link. Accept or decline from Friends.",
          link: "/friends",
        },
        client,
      );
    });
    return { groupId: "" };
  }

  const group = await findGroupById(link.group_id!);
  if (!group) notFound(DEAD_LINK_MESSAGE);
  if (await isMember(group.id, userId)) return { groupId: group.id };
  if (await blockedPairExists([userId, ...(await listMembers(group.id)).map((member) => member.id)])) notFound(DEAD_LINK_MESSAGE);

  const inviter = await findUserById(link.inviter_id);
  // Under the group's ledger lock like every roster change: a settlement
  // being validated sees the roster before or after the join, never mid-way.
  await transaction(async (client) => {
    await lockGroupLedgers(client, [group.id]);
    // §33b: a leaked bearer link must not grow a roster without bound.
    if ((await listMembers(group.id, client)).length >= MAX_GROUP_MEMBERS) {
      invalid("this group is full");
    }
    await addMember(group.id, userId, "member", client);
    if (link.inviter_id !== userId) {
      await insertFriendship(userId, link.inviter_id, client);
    }
    const audience = (await listMembers(group.id, client)).map((member) => member.id);
    await recordActivity(
      {
        groupId: group.id,
        actorId: userId,
        type: "member_added",
        message: `${acceptor.name} joined "${group.name}" via ${inviter?.name ?? "a member"}'s invite link`,
        link: `/groups/${group.id}`,
        audience,
      },
      client,
    );
    // The rest of the roster hears who joined; the inviter is told by the
    // "accepted your invite" notice below instead.
    await insertNotifications(
      audience.filter((memberId) => memberId !== userId && memberId !== link.inviter_id),
      {
        actorId: userId,
        type: "member_added",
        title: `${acceptor.name} joined "${group.name}"`,
        body: "",
        link: `/groups/${group.id}`,
      },
      client,
    );
  });
  await notifyInviteAccepted(link.inviter_id, acceptor.name, `/groups/${group.id}`);
  return { groupId: group.id };
}

/**
 * Tells the inviter their link worked — the one moment an invite produces
 * for its sender.
 *
 * @param inviterId - Who shared the link.
 * @param acceptorName - Who just accepted it.
 * @param link - Where tapping the notification lands.
 */
async function notifyInviteAccepted(
  inviterId: string,
  acceptorName: string,
  link: string,
): Promise<void> {
  await insertNotifications(
    [inviterId],
    {
      type: "invite_accepted",
      title: `${acceptorName} accepted your invite`,
      body: "",
      link,
    },
  );
}

/**
 * Ends a friendship (§37), allowed only when the pairwise net with that
 * person is exactly zero in EVERY currency: the rule group removal already
 * follows, because removing the row that makes somebody reachable must not
 * orphan debt. Quiet by design, also like group removal: no notification,
 * no feed event. Shared history and group co-memberships are untouched, and
 * they can be re-added later.
 *
 * The transaction takes the pair's inbox locks first (the order every
 * friendship writer uses), then both participant ledger locks, so the zero
 * check cannot race a concurrent one-off expense or settlement. Group
 * writes need no serializing here: a group debt lives with the group and
 * both memberships either way.
 *
 * @param userId - Id of the authenticated caller.
 * @param friendId - The friend being removed.
 * @throws UsecaseError "failed_precondition" while any balance is
 *   outstanding; "not_found" when they are not a friend.
 */
export async function removeFriend(userId: string, friendId: string): Promise<void> {
  if (userId === friendId) invalid("you cannot remove yourself");
  const friend = await findUserById(friendId);
  if (!friend || !(await friendshipExists(userId, friendId))) {
    notFound("you're not friends with them");
  }
  await transaction(async (client) => {
    // Inbox locks first (the order every friendship writer takes), then the
    // participant ledger locks every one-off expense and settlement writer
    // holds — so the zero check below cannot race money being written
    // between this pair.
    await lockFriendRequestInboxes(client, [userId, friendId]);
    await lockParticipantLedgers(client, [userId, friendId]);
    const nets = await netWithUser(userId, friendId);
    if ([...nets.values()].some((cents) => cents !== 0)) {
      throw new UsecaseError(
        "failed_precondition",
        `you still have unsettled balances with ${friend.name}. Settle up first`,
      );
    }
    await deleteFriendship(userId, friendId, client);
  });
}

/**
 * Nudges someone who owes the caller money, as an in-app notification that
 * names how the caller wants to be paid, so the debtor knows which app to
 * open. Names only: the details are read fresh in the settle dialog.
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
  if (await blockedBetween(userId, debtorId)) denied("reminders are unavailable for a blocked connection");
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

    // The nudge says how the sender wants to be paid, because "where do I
    // send it?" is the very next question and making the debtor ask defeats
    // the reminder. It names the method and stops there: a notification is a
    // stored row, and an account number has no business outliving the debt.
    const payHint = reminderPaymentHint(
      sender.name,
      (await listPaymentMethodsByUser(userId, client)).map(cleanMethodRow).map((method) => ({
        name: method.name,
        currency: method.currency ?? "",
        preferred: method.is_preferred,
      })),
      owedBuckets.map(([currency]) => currency),
    );
    const owed = owedBuckets.map(([currency, cents]) => formatMoney(cents, currency)).join(" and ");

    await insertNotifications(
      [debtorId],
      {
        actorId: userId,
        type: "reminder",
        title: `${sender.name} sent you a reminder`,
        body: payHint ? `You owe ${owed}. ${payHint}` : `You owe ${owed}`,
        link,
      },
      client,
    );
  });
}

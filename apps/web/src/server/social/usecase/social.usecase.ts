/** Social business logic: friends (friendships ∪ expense counterparties), activity feed, notifications. */

import {
  deleteFriendRequest,
  friendshipExists,
  insertFriendRequest,
  insertFriendship,
  listFriendIds,
  listIncomingFriendRequestIds,
} from "@/server/social/repo/friendships.repo";
import { randomBytes } from "node:crypto";
import { findUserById, findUsersByIds, type UserRow } from "@/server/auth/repo/users.repo";
import { mergeAccounts } from "@/server/auth/repo/accountMerge.repo";
import {
  findOrCreateUserByEmail,
  findOrCreateUserByPhone,
} from "@/server/auth/usecase/auth.usecase";
import {
  findActiveFriendLink,
  findActiveGroupLink,
  findActiveLinkByToken,
  insertInviteLink,
  revokeFriendLinksFor,
  revokeGroupLinks,
  type InviteLinkRow,
} from "@/server/social/repo/inviteLinks.repo";
import {
  addMember,
  findGroupById,
  listCoMemberIds,
  listMembers,
  memberRole,
} from "@/server/group/repo/groups.repo";
import { insertActivity as recordActivity } from "@/server/social/repo/activity.repo";
import { OWNER_ROLE } from "@/server/group/group.constants";
import { listActivityMonths, listActivityPage } from "@/server/social/repo/activity.repo";
import { isMember } from "@/server/group/repo/groups.repo";
import { isUniqueViolation } from "@/server/common/db";
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
  INVITE_LINK_TOKEN_BYTES,
  INVITE_LINK_TOKEN_PATTERN,
  MAX_ACTIVITY_PAGE_SIZE,
  REMINDER_COOLDOWN_HOURS,
} from "@/server/social/social.constants";
import { lockGroupLedgers } from "@/server/common/ledgerLocks";
import { formatMoney } from "@haalkhata/shared/money/money";
import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import { findPaymentMethod } from "@haalkhata/shared/payment/methods";
import { getOverallBalances, netWithUser } from "@/server/expense/usecase/balance.usecase";
import { denied, invalid, notFound } from "@/server/common/errors";
import { transaction } from "@/server/common/db";
import { toFriendRequestUser, toPublicUser } from "@/server/auth/usecase/user.mapper";

/**
 * Adds a friend by id, email, or phone.
 *
 * A REGISTERED target keeps the request flow: nothing exists until they
 * accept, and the caller's response stays empty. An email or phone that
 * matches nobody (or an unclaimed invite) becomes an immediate "Invited"
 * friendship — there is nobody to accept, and an unregistered row can be
 * part of no transaction (plan.txt §33), so the entry is a contact-book
 * line until the person signs up and claims it.
 *
 * Deliberate trade-off, direction over §21's strict oracle: the differing
 * outcomes ("Invited" appears vs a request quietly pends) reveal whether an
 * identifier has an account. Frictionless inviting won; the rate limit and
 * this note remain.
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
    // Creates the Invited row when nobody holds the address; the shape
    // validation lives inside and matches the old inline checks.
    friend = await findOrCreateUserByEmail(email);
  } else {
    friend = await findOrCreateUserByPhone(phone);
  }

  if (!friend || friend.id === userId || friend.merged_into !== null) {
    return {};
  }
  // An unclaimed row cannot accept anything, so the friendship is immediate
  // and the person appears as "Invited" (registered=false) on refetch.
  if (friend.password_hash === null && friend.google_sub === null) {
    await insertFriendship(userId, friend.id);
    return {};
  }
  // Registered targets: request flow, and self/duplicate/pending stay
  // indistinguishable to the caller.
  if (await friendshipExists(userId, friend.id)) {
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

/** One generic sentence for every unusable token: missing, revoked, malformed. */
const DEAD_LINK_MESSAGE = "that invite link isn't valid or was turned off";

/** Mints a fresh bearer token for an invite link. */
function newInviteToken(): string {
  return randomBytes(INVITE_LINK_TOKEN_BYTES).toString("base64url");
}

/**
 * Whether a row is an unclaimed invitation — no way to sign into it.
 *
 * @param user - Row to classify.
 * @returns True when neither credential is set.
 */
function isUnclaimed(user: UserRow): boolean {
  return user.password_hash === null && user.google_sub === null;
}

/**
 * The invited person's active reminder link, created on first ask.
 *
 * The target must be unregistered (a registered person signs in, they don't
 * need a claiming link) and connected to the caller — their friend, or a
 * co-member of some group — so a bare user id is not enough to mint a link
 * that would claim somebody else's invitation.
 *
 * @param userId - Authenticated caller who will share the link.
 * @param invitedUserId - The Invited person the link reminds.
 * @returns The link's bearer token.
 * @throws UsecaseError when the target is missing, already registered, or
 *   not connected to the caller.
 */
export async function getFriendInviteLink(
  userId: string,
  invitedUserId: string,
): Promise<{ token: string }> {
  const invited = await findUserById(invitedUserId);
  if (!invited || invited.merged_into !== null) notFound("that person no longer exists");
  if (!isUnclaimed(invited)) {
    invalid("they already have an account — no invite needed");
  }
  const connected = (await friendshipExists(userId, invitedUserId))
    || (await listCoMemberIds(userId)).includes(invitedUserId);
  if (!connected) denied("you can only invite people you already share a friendship or a group with");

  const existing = await findActiveFriendLink(userId, invitedUserId);
  if (existing) return { token: existing.token };
  const token = newInviteToken();
  try {
    await insertInviteLink({
      token,
      kind: "friend",
      inviterId: userId,
      groupId: null,
      invitedUserId,
    });
  } catch (error) {
    // A concurrent ask won the one-active-link index; both wanted the same link.
    if (!isUniqueViolation(error)) throw error;
    const winner = await findActiveFriendLink(userId, invitedUserId);
    if (winner) return { token: winner.token };
    throw error;
  }
  return { token };
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
    await insertInviteLink({ token, kind: "group", inviterId: userId, groupId, invitedUserId: null });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await findActiveGroupLink(groupId);
    if (winner) return { token: winner.token };
    throw error;
  }
  return { token };
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
  const invited = await findUserById(link.invited_user_id!);
  // A claimed invitation is a finished one; the link no longer offers anything.
  if (!invited || invited.merged_into !== null || !isUnclaimed(invited)) {
    notFound(DEAD_LINK_MESSAGE);
  }
  return {
    kind: "friend",
    inviterName: inviter?.name ?? "Someone",
    groupName: "",
    memberCount: 0,
    invitedName: invited.name,
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
 * Accepts an invite link as the signed-in caller.
 *
 * Friend link: the still-unclaimed invited identity is merged into the
 * caller's account — its friendships and group memberships move, and by the
 * no-transaction rule there is no money to move — then the caller and
 * inviter are befriended. If the caller already IS that identity (they
 * signed in with the matching email and claimed the row in place), only the
 * friendship is left to wire. A link whose identity was claimed by somebody
 * else is dead.
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
  const acceptor = await findUserById(userId);
  if (!acceptor) denied("account no longer exists");
  if (link.inviter_id === userId && link.kind === "friend") {
    invalid("that's your own invite link");
  }

  if (link.kind === "friend") {
    const invitedId = link.invited_user_id!;
    if (invitedId !== userId) {
      const invited = await findUserById(invitedId);
      if (!invited || invited.merged_into !== null || !isUnclaimed(invited)) {
        notFound(DEAD_LINK_MESSAGE);
      }
      // No-money claim: memberships and friendships ride along in one
      // transaction; the invariant inside would roll back anything else.
      await mergeAccounts(userId, invitedId, invited.phone);
      await revokeFriendLinksFor(invitedId);
    }
    await insertFriendship(userId, link.inviter_id);
    await notifyInviteAccepted(link.inviter_id, acceptor.name, "/friends");
    return { groupId: "" };
  }

  const group = await findGroupById(link.group_id!);
  if (!group) notFound(DEAD_LINK_MESSAGE);
  if (await isMember(group.id, userId)) return { groupId: group.id };

  const inviter = await findUserById(link.inviter_id);
  // Under the group's ledger lock like every roster change: a settlement
  // being validated sees the roster before or after the join, never mid-way.
  await transaction(async (client) => {
    await lockGroupLedgers(client, [group.id]);
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

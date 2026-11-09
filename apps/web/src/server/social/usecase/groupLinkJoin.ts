/** Joining a group through somebody's link, which a group's own link and a live split on a group bill both do. */

import { invalid, notFound } from "@/server/common/errors";
import { lockGroupLedgers, withLedgerTransaction } from "@/server/common/ledger/ledgerLocks";
import type { UserRow } from "@/server/auth/repo/users.repo";
import { MAX_GROUP_MEMBERS } from "@/server/group/group.constants";
import { addMember, isMember, listMembers, type GroupRow } from "@/server/group/repo/groups.repo";
import { assertRoomForAnotherGroup } from "@/server/group/usecase/groupLimit";
import { blockedBetween, blockedPairExists } from "@/server/safety/repo/safety.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertFriendship } from "@/server/social/repo/friendships.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { personNotification } from "./personNotification";
import { notificationLabel } from "./notificationLabel";
import { loadActiveLink } from "./activeInviteLink";
import { DEAD_LINK_MESSAGE } from "@/server/social/social.constants";

/**
 * Enrols somebody in a group through a link, befriends them with whoever
 * shared it, and tells the roster who has joined.
 *
 * @param acceptor - Who is joining.
 * @param group - The group.
 * @param inviterId - Who shared the link.
 * @param inviterName - Their name, for the feed.
 * @param linkToken - A group link to validate under its group lock.
 * @throws UsecaseError (not_found) when somebody in the group has blocked them
 *   or they have blocked somebody in it, or (invalid_argument) when it is full.
 */
export async function joinGroupThroughLink(
  acceptor: UserRow,
  group: GroupRow,
  inviterId: string,
  inviterName: string,
  linkToken?: string,
): Promise<void> {
  const userId = acceptor.id;
  const existingIds = (await listMembers(group.id)).map((member) => member.id);
  if (await blockedPairExists([userId, ...existingIds], existingIds)) {
    notFound(DEAD_LINK_MESSAGE);
  }
  // Under the group's ledger lock like every roster change: a settlement
  // being validated sees the roster before or after the join, never mid-way.
  await withLedgerTransaction(async (client) => {
    await lockGroupLedgers(client, [group.id]);
    if (linkToken) {
      const current = await loadActiveLink(linkToken, client);
      if (current.kind !== "group" || current.group_id !== group.id || current.inviter_id !== inviterId) notFound(DEAD_LINK_MESSAGE);
      if (await blockedBetween(userId, inviterId, client)) notFound(DEAD_LINK_MESSAGE);
    }
    if (await isMember(group.id, userId, client)) return;
    // §33b: a leaked bearer link must not grow a roster without bound.
    if ((await listMembers(group.id, client)).length >= MAX_GROUP_MEMBERS) {
      invalid("this group is full");
    }
    await assertRoomForAnotherGroup([acceptor], userId, client);
    await addMember(group.id, userId, "member", client);
    if (inviterId !== userId) await insertFriendship(userId, inviterId, client);
    const audience = (await listMembers(group.id, client)).map((member) => member.id);
    await insertActivity(
      {
        groupId: group.id,
        actorId: userId,
        type: "member_added",
        message: `${acceptor.name} joined "${group.name}" via ${inviterName}'s invite link`,
        link: `/groups/${group.id}`,
        audience,
      },
      client,
    );
    // The rest of the roster hears who joined; the inviter is told by the
    // "accepted your invite" notice instead.
    await insertNotifications(
      audience.filter((memberId) => memberId !== userId && memberId !== inviterId),
      {
        actorId: userId,
        type: "member_added",
        ...personNotification(acceptor.name, `Joined "${notificationLabel(group.name)}"`),
        link: `/groups/${group.id}`,
      },
      client,
    );
    if (linkToken) {
      await insertNotifications(
        [inviterId],
        {
          type: "invite_accepted",
          actorId: userId,
          ...personNotification(acceptor.name, `Joined "${notificationLabel(group.name)}"`, "Via your invite"),
          link: `/groups/${group.id}`,
        },
        client,
      );
    }
  });
}

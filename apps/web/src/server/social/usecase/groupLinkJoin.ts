/** Joining a group through somebody's link, which a group's own link and a live split on a group bill both do. */

import { transaction } from "@/server/common/db/db";
import { invalid, notFound } from "@/server/common/errors";
import { lockGroupLedgers } from "@/server/common/ledger/ledgerLocks";
import type { UserRow } from "@/server/auth/repo/users.repo";
import { MAX_GROUP_MEMBERS } from "@/server/group/group.constants";
import { addMember, listMembers, type GroupRow } from "@/server/group/repo/groups.repo";
import { assertRoomForAnotherGroup } from "@/server/group/usecase/groupLimit";
import { blockedPairExists } from "@/server/safety/repo/safety.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertFriendship } from "@/server/social/repo/friendships.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { personNotification } from "./personNotification";
import { notificationLabel } from "./notificationLabel";
import { DEAD_LINK_MESSAGE } from "@/server/social/social.constants";

/**
 * Enrols somebody in a group through a link, befriends them with whoever
 * shared it, and tells the roster who has joined.
 *
 * @param acceptor - Who is joining.
 * @param group - The group.
 * @param inviterId - Who shared the link.
 * @param inviterName - Their name, for the feed.
 * @throws UsecaseError (not_found) when somebody in the group has blocked them
 *   or they have blocked somebody in it, or (invalid_argument) when it is full.
 */
export async function joinGroupThroughLink(
  acceptor: UserRow,
  group: GroupRow,
  inviterId: string,
  inviterName: string,
): Promise<void> {
  const userId = acceptor.id;
  if (await blockedPairExists([userId, ...(await listMembers(group.id)).map((member) => member.id)])) {
    notFound(DEAD_LINK_MESSAGE);
  }
  // Under the group's ledger lock like every roster change: a settlement
  // being validated sees the roster before or after the join, never mid-way.
  await transaction(async (client) => {
    await lockGroupLedgers(client, [group.id]);
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
  });
}

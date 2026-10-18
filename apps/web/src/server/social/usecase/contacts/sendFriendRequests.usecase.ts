/**
 * SendFriendRequests: one friend request to each account the caller picked
 * from their found contacts. The apps send one person per call (each row's
 * Add); a list is still accepted, within the same rules, by the API.
 */

import { transaction } from "@/server/common/db/db";
import { invalid } from "@/server/common/errors";
import { findUserById } from "@/server/auth/repo/users.repo";
import { isRegisteredUser } from "@/server/auth/usecase/identity/user.mapper";
import { findRequestableAccounts } from "@/server/social/repo/contacts/contactDiscovery.repo";
import { insertFriendRequests } from "@/server/social/repo/friendships.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { friendRequestNotice } from "@/server/social/usecase/friendRequestNotice";
import { MAX_FRIEND_REQUESTS_PER_SEND } from "@/server/social/social.constants";

/**
 * Sends a request to each listed account that can take one, with AddFriend's
 * rules per id. Anyone who cannot (the caller, a blocked, unregistered,
 * merged or unfindable account, an existing friend, a pair with a request
 * pending either way) is skipped without saying so; the client already
 * learned their state from FindContacts and shows each row's own outcome
 * after refetching. The requests and their notifications commit together.
 *
 * @param userId - Authenticated caller.
 * @param recipientIds - Accounts to ask, normally from FindContacts.
 * @throws UsecaseError (invalid_argument) when no id is given or more than
 *   {@link MAX_FRIEND_REQUESTS_PER_SEND} are.
 */
export async function sendFriendRequests(userId: string, recipientIds: string[]): Promise<void> {
  const distinctIds = [
    ...new Set(recipientIds.map((recipientId) => recipientId.trim())),
  ].filter((recipientId) => recipientId !== "");
  if (distinctIds.length === 0) invalid("choose at least one person to send a friend request to");
  if (distinctIds.length > MAX_FRIEND_REQUESTS_PER_SEND) {
    invalid(`send at most ${MAX_FRIEND_REQUESTS_PER_SEND} friend requests at a time`);
  }
  const requester = await findUserById(userId);
  if (!requester) return;
  const recipients = (await findRequestableAccounts(userId, distinctIds)).filter(isRegisteredUser);
  if (recipients.length === 0) return;
  await transaction(async (client) => {
    const insertedIds = await insertFriendRequests(
      userId,
      recipients.map((recipient) => recipient.id),
      client,
    );
    await insertNotifications(
      insertedIds,
      { actorId: userId, ...friendRequestNotice(requester.name) },
      client,
    );
  });
}

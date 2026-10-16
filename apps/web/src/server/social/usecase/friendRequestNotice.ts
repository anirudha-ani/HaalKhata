/** The in-app notification a friend request sends, shared by every way of sending one. */

import { friendRequestTitle } from "@haalkhata/shared/contacts/contactsCopy";

/** What the recipient of a friend request is told, before any row is written. */
export interface FriendRequestNotice {
  /** Notification kind; matches the notifications table CHECK. */
  type: "friend_request";
  /** Headline naming the sender. */
  title: string;
  /** What the recipient can do about it. */
  body: string;
  /** Where the notification opens. */
  link: string;
}

/**
 * Words the notification a new friend request produces. AddFriend and
 * SendFriendRequests both use it, and the title comes from the shared copy
 * the mobile confirm sheet previews, so the recipient sees one message
 * however the request was sent and the preview cannot drift from it.
 *
 * @param requesterName - Display name of the person sending the request.
 * @returns The notification content to insert for each recipient.
 */
export function friendRequestNotice(requesterName: string): FriendRequestNotice {
  return {
    type: "friend_request",
    title: friendRequestTitle(requesterName),
    body: "Accept or decline it from Friends.",
    link: "/friends",
  };
}

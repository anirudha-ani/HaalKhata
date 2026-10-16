/** The in-app notification a friend request sends, shared by every way of sending one. */

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
 * SendFriendRequests both use it, and the mobile confirm sheet previews the
 * same title, so the recipient sees one message however the request was sent.
 *
 * @param requesterName - Display name of the person sending the request.
 * @returns The notification content to insert for each recipient.
 */
export function friendRequestNotice(requesterName: string): FriendRequestNotice {
  return {
    type: "friend_request",
    title: `${requesterName} sent you a friend request`,
    body: "Accept or decline it from Friends.",
    link: "/friends",
  };
}

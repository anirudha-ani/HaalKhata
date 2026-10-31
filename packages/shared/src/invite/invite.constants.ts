/** How long a group's join link works, read by the server that enforces it and the apps that say it. */

/**
 * Days a group's join link works (7). A link that escaped into a chat or a
 * screenshot stops letting people in a week later; asking for the link after
 * that mints a new one, and sharing it again does not extend the old one.
 * Profile links only send a friend request the owner confirms, and do not
 * expire.
 */
export const GROUP_INVITE_LINK_LIFETIME_DAYS = 7;

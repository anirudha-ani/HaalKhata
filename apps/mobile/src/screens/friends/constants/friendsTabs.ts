/** Friends-screen constants: the screen's tabs. */

/** The three views of the friends screen. */
export type FriendsTab = "friends" | "requests" | "sent";

/** The tabs in display order, with the short labels the web uses on phones. */
export const FRIENDS_TABS: { value: FriendsTab; label: string }[] = [
  { value: "friends", label: "Friends" },
  { value: "requests", label: "Requests" },
  { value: "sent", label: "Sent" },
];

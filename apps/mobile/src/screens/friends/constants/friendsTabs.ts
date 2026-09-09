/** Friends-screen constants: the screen's tabs. */

/** The four views of the friends screen. */
export type FriendsTab = "friends" | "requests" | "sent" | "invited";

/**
 * The tabs in display order. Labels are the short forms the web uses on
 * phones: four full labels overflow a 375-point screen.
 */
export const FRIENDS_TABS: { value: FriendsTab; label: string }[] = [
  { value: "friends", label: "Friends" },
  { value: "requests", label: "Requests" },
  { value: "sent", label: "Sent" },
  { value: "invited", label: "Invited" },
];

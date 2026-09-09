/** Friends-route constants: the page's tabs. */

/** The four views of the friends page. */
export type FriendsTab = "friends" | "requests" | "sent" | "invited";

/**
 * The tabs in display order. `label` is for tablet width and up; `shortLabel`
 * for phones, where four full labels at text-sm overflow a 375px screen.
 */
export const FRIENDS_TABS: { value: FriendsTab; label: string; shortLabel: string }[] = [
  { value: "friends", label: "Friends", shortLabel: "Friends" },
  { value: "requests", label: "Friend requests", shortLabel: "Requests" },
  { value: "sent", label: "Sent requests", shortLabel: "Sent" },
  { value: "invited", label: "Invited friends", shortLabel: "Invited" },
];

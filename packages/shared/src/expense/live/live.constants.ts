/** How a live split behaves, read by the server that enforces it and the apps that show it. */

/** How long a live split runs: long enough to sort out a bill at the table. */
export const LIVE_SPLIT_MINUTES = 30;

/** How often a form or bill with a live split open looks for what others did. */
export const LIVE_SPLIT_CHECK_INTERVAL_MS = 3_000;

/** What a link to a live split that has finished answers. */
export const LIVE_SPLIT_ENDED_MESSAGE = "this live split has ended";

/** How often a live split's clock is brought up to date. */
export const LIVE_SPLIT_CLOCK_INTERVAL_MS = 15_000;

/** What a bill is called when it opens to the table before anybody has named it. */
export const LIVE_SPLIT_DEFAULT_NAME = "Receipt";

/** The heading on the invite that opens with a live split. */
export const LIVE_INVITE_TITLE = "Invite people";

/** What the invite says joining does. */
export const LIVE_INVITE_EXPLAINER = "Anyone with this link joins the expense and can edit it with you until it ends.";

/** The most portions a person can hold of one line: what the column that saves them can take. */
export const MAX_ASSIGNMENT_WEIGHT = 2_147_483_647;

/**
 * Says how far the table has got, beside its avatars.
 *
 * @param savedCount - How many have saved.
 * @param peopleCount - How many have joined.
 * @returns The words.
 */
export function liveSavedCount(savedCount: number, peopleCount: number): string {
  return `${savedCount} of ${peopleCount} saved`;
}

/**
 * Says where somebody is, for whoever cannot see their avatar.
 *
 * @param name - Their name.
 * @param saved - Whether they have saved.
 * @returns The words.
 */
export function livePersonLabel(name: string, saved: boolean): string {
  return `${name}, ${saved ? "saved" : "joined"}`;
}

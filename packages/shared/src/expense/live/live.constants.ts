/** How a live split behaves, read by the server that enforces it and the apps that show it. */

/** How long a live split runs: long enough to sort out a bill at the table. */
export const LIVE_SPLIT_MINUTES = 30;

/** How often a live split's screen looks for what others did. */
export const LIVE_SPLIT_CHECK_INTERVAL_MS = 3_000;

/** What a link to a live split that has finished answers. */
export const LIVE_SPLIT_ENDED_MESSAGE = "this live split has ended";

/** Why an expense several people paid cannot be split live. */
export const LIVE_SPLIT_ONE_PAYER_MESSAGE = "a live split needs one person who paid";

/** Why an expense without receipt lines cannot be split live. */
export const LIVE_SPLIT_LINES_MESSAGE = "a live split needs a receipt with lines on it";

/** How often a live split's clock is brought up to date. */
export const LIVE_SPLIT_CLOCK_INTERVAL_MS = 15_000;

/** Shown under the button that starts a live split from the expense form. */
export const LIVE_SPLIT_START_HINT = `Share a link so everyone at the table can claim what they had. It stays open for ${LIVE_SPLIT_MINUTES} minutes.`;

/** What a live split's page says to somebody it no longer has anything for. */
export const LIVE_SPLIT_CLOSED_MESSAGE = "This live split has ended, and you didn’t claim anything on it.";

/**
 * Says whose lines stay unclaimed.
 *
 * @param payerName - Who paid.
 * @returns A sentence for under the total.
 */
export function unclaimedStaysWith(payerName: string): string {
  return `Anything nobody claims stays with ${payerName}.`;
}

/** What the figure is for somebody who has paid their share. */
export const LIVE_SHARE_SETTLED_LABEL = "Your share, settled";

/** What the figure is for whoever paid, once nobody owes them anything. */
export const LIVE_EVERYONE_SETTLED_LABEL = "Everyone has settled";

/** What the figure is for whoever paid: it stays true however much has been paid back. */
export const LIVE_OTHERS_SHARES_LABEL = "Others' shares";

/**
 * What the figure is for everybody else. It is what the bill comes to for
 * them, not what they owe: other bills and payments between the same people
 * move that, and the settle dialog is what shows it.
 */
export const LIVE_MY_SHARE_LABEL = "Your share";

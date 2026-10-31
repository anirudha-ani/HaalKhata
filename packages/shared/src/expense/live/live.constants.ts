/** How a live split behaves, read by the server that enforces it and the apps that show it. */

/** How long a live split runs: long enough to sort out a bill at the table. */
export const LIVE_SPLIT_MINUTES = 30;

/** How often a live split's screen looks for what others did. */
export const LIVE_SPLIT_CHECK_INTERVAL_MS = 3_000;

/** What a link to a live split that has finished answers. */
export const LIVE_SPLIT_ENDED_MESSAGE = "this live split has ended";

/** Why an expense without receipt lines cannot be split live. */
export const LIVE_SPLIT_LINES_MESSAGE = "a live split needs a receipt with lines on it";

/** How often a live split's clock is brought up to date. */
export const LIVE_SPLIT_CLOCK_INTERVAL_MS = 15_000;

/** Shown under the button that starts a live split from the expense form. */
export const LIVE_SPLIT_START_HINT = `Share a link so everyone at the table can claim what they had. It stays open for ${LIVE_SPLIT_MINUTES} minutes.`;

/** What a live split's page says to somebody it no longer has anything for. */
export const LIVE_SPLIT_CLOSED_MESSAGE = "This live split has ended, and you didn’t claim anything on it. Anyone on the bill can open it again.";

/** The most portions a person can hold of one line: what the column that saves them can take. */
export const MAX_ASSIGNMENT_WEIGHT = 2_147_483_647;

/**
 * Says whose lines stay unclaimed.
 *
 * @param payerNames - Who paid, as this person calls them.
 * @returns A sentence for under the total.
 */
export function unclaimedStaysWith(payerNames: readonly string[]): string {
  return `Anything nobody claims stays with ${payerNames.length === 1 ? payerNames[0] : "whoever paid"}.`;
}

/**
 * Names what somebody paid, for a control or a title.
 *
 * @param name - "You", or their name.
 * @returns The phrase, to follow a verb.
 */
export function whatPaid(name: string): string {
  return `what ${name === "You" ? "you" : name} paid`;
}

/** Said beside the amount somebody is entering for what they paid. */
export const LIVE_PAID_HINT = "Everyone else’s amounts adjust so the bill still adds up.";

/** Why an amount somebody typed for what they paid will not do. */
export const LIVE_PAID_AMOUNT_MESSAGE = "Enter how much was paid.";

/**
 * Why somebody cannot have paid what they typed.
 *
 * @param total - The bill's total, formatted.
 * @returns The sentence.
 */
export function paidTooMuchMessage(total: string): string {
  return `That’s more than the whole bill (${total}).`;
}

/** What the figure is for somebody who has paid their share. */
export const LIVE_SHARE_SETTLED_LABEL = "Your share, settled";

/** What the figure is for whoever paid, once nobody owes them anything. */
export const LIVE_EVERYONE_SETTLED_LABEL = "Everyone has settled";

/** What the figure is for somebody who paid more than their share: it stays true however much has been paid back. */
export const LIVE_COVERED_LABEL = "You covered for others";

/**
 * What the figure is for everybody else. It is what the bill comes to for
 * them, not what they owe: other bills and payments between the same people
 * move that, and the settle dialog is what shows it.
 */
export const LIVE_MY_SHARE_LABEL = "Your share";

/** Per-account rate limits for authenticated, resource-intensive RPCs. */

import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { requireUser } from "@/server/api/connect/context";
import { accountRateLimits } from "@/server/common/rateLimit/rateLimit";

/**
 * Per-minute limits for resource-intensive authenticated operations.
 *
 * The ledger reads are here because each one rebuilds balances from every
 * row in scope: a group's whole history, a pair's whole history, or every
 * group the caller is in. A person tapping through screens uses a handful
 * a minute; a script can otherwise turn one account into a load test.
 */
export const RPC_RATE_LIMITS = {
  acceptInvite: 10,
  // A comment pushes to everyone on the expense, so this is what stops one
  // person buzzing a whole group as fast as they can type.
  addComment: 20,
  addFriend: 10,
  addMembers: 15,
  createExpense: 30,
  // A person makes a group for a trip or a household; a script making them
  // by the thousand is what the per-person cap and this limit stop.
  createGroup: 10,
  // A lookup checks up to 1,000 identifiers; the daily total is capped in
  // the database as well.
  findContacts: 5,
  getFriendLedger: 60,
  getGroupBalances: 60,
  getInsights: 30,
  // An open edit form asks every 10 s and a live split every 3 s. A person
  // with a few tabs open stays well inside this.
  getExpenseVersion: 120,
  getOverallBalances: 60,
  endOtherSessions: 10,
  // Signing several old devices out in a row stays well inside this.
  endSession: 30,
  listExpenses: 60,
  listSessions: 60,
  // Each older page of a statement fingerprints the pair's whole history
  // before reading its own rows; someone scrolling a long one reads a few.
  listFriendLedgerEntries: 120,
  listGroups: 60,
  // Read when a person's own debt on a live split changes, so a burst of
  // claiming lines stays well inside this.
  listOwedPeople: 120,
  // Settling up with several friends in a row stays well inside this; each
  // payment locks the groups the two people share.
  recordSettlement: 20,
  registerDevice: 10,
  removeFriend: 10,
  // The apps send one request per call, from each person's Add on Find
  // friends, so this sits beside AddFriend rather than far below it. With at
  // most 10 ids a call, one account still sends no more than 200 a minute.
  sendFriendRequests: 20,
  sendReminder: 10,
  sendTestPush: 3,
  setGroupStatus: 30,
  startLiveSplit: 10,
  // Claiming a line in a live split is an edit, and one person may tick
  // a dozen in a few seconds.
  updateExpense: 60,
  updatePushPreferences: 30,
  writePaymentMethod: 30,
} as const;

/**
 * Resolves the authenticated caller and consumes one per-account rate-limit slot.
 *
 * @param handlerContext - Connect request context carrying the session.
 * @param scope - Stable operation name, kept separate from every other bucket.
 * @param maxAttempts - Number of calls accepted in the rolling minute.
 * @returns The authenticated user id.
 * @throws ConnectError ResourceExhausted when the account exceeds its limit.
 */
export async function requireRateLimitedUser(
  handlerContext: HandlerContext,
  scope: string,
  maxAttempts: number,
): Promise<string> {
  const userId = await requireUser(handlerContext);
  if (!accountRateLimits.check(`rpc:${scope}:${userId}`, maxAttempts)) {
    throw new ConnectError("too many requests, please try again later", Code.ResourceExhausted);
  }
  return userId;
}

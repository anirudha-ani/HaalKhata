/** Per-account rate limits for authenticated, resource-intensive RPCs. */

import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { requireUser } from "@/server/api/connect/context";
import { rateLimitCheck } from "@/server/common/rateLimit/rateLimit";

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
  addFriend: 10,
  addMembers: 15,
  createExpense: 30,
  // A lookup checks up to 1,000 identifiers; the daily total is capped in
  // the database as well.
  findContacts: 5,
  getFriendLedger: 60,
  getGroupBalances: 60,
  getInsights: 30,
  getOverallBalances: 60,
  listExpenses: 60,
  // Each older page of a statement fingerprints the pair's whole history
  // before reading its own rows; someone scrolling a long one reads a few.
  listFriendLedgerEntries: 120,
  listGroups: 60,
  parseReceipt: 5,
  registerDevice: 10,
  removeFriend: 10,
  // The apps send one request per call, from each person's Add on Find
  // friends, so this sits beside AddFriend rather than far below it. With at
  // most 10 ids a call, one account still sends no more than 200 a minute.
  sendFriendRequests: 20,
  sendReminder: 10,
  sendTestPush: 3,
  setGroupStatus: 30,
  updatePushPreferences: 30,
  writePaymentMethod: 30,
} as const;

/** Maximum receipt-provider jobs allowed in this process at once. */
export const MAX_CONCURRENT_RECEIPT_PARSES = 2;

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
  if (!rateLimitCheck(`rpc:${scope}:${userId}`, maxAttempts)) {
    throw new ConnectError("too many requests, please try again later", Code.ResourceExhausted);
  }
  return userId;
}

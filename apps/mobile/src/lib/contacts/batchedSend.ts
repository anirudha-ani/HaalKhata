/** Sends friend requests to a long list, one SendFriendRequests call per batch. */

import { FRIEND_REQUESTS_PER_SEND } from "@haalkhata/shared/contacts/contacts.constants";

/** What a send across several SendFriendRequests calls achieved. */
export interface SendOutcome {
  /** Accounts whose call went through. */
  sent: string[];
  /** Why a later call failed, when one did; "" otherwise. */
  failure: string;
}

/**
 * Sends requests in calls of the server's size, one after another. A call
 * failing after earlier ones went through reports what was sent and why the
 * rest was not; only a failing first call is a failed send.
 *
 * @param userIds - Accounts to ask.
 * @param sendBatch - Makes one SendFriendRequests call.
 * @param describe - Turns a failure into the sentence shown.
 * @returns The ids sent and any failure.
 * @throws Whatever the first call throws.
 */
export async function sendInBatches(
  userIds: string[],
  sendBatch: (batch: string[]) => Promise<unknown>,
  describe: (failure: unknown) => string,
): Promise<SendOutcome> {
  const sent: string[] = [];
  for (let start = 0; start < userIds.length; start += FRIEND_REQUESTS_PER_SEND) {
    const batch = userIds.slice(start, start + FRIEND_REQUESTS_PER_SEND);
    try {
      await sendBatch(batch);
    } catch (failure) {
      if (sent.length === 0) throw failure;
      return { sent, failure: describe(failure) };
    }
    sent.push(...batch);
  }
  return { sent, failure: "" };
}

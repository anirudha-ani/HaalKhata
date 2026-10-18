/** Development provider: prints each push instead of sending it. Refused in production by readiness. */

import { newId } from "@/server/common/db/db";
import { logEvent } from "@/server/common/logger";
import type { PushProvider } from "@/server/push/usecase/provider/pushTypes";

/**
 * Logs every message it is given and accepts all of them, so the whole path
 * — outbox, filtering, badge, wording, links — can be checked locally
 * without a phone. Tokens are shortened in the log.
 */
export const logPushProvider: PushProvider = {
  name: "log",
  async send(messages) {
    for (const message of messages) {
      logEvent("info", "push (log provider)", {
        to: `${message.to.slice(0, 22)}…`,
        title: message.title,
        body: message.body,
        badge: message.badge,
        link: message.data.link,
        recipientId: message.data.recipientId,
        threadId: message.threadId,
        collapseId: message.collapseId,
        categoryId: message.categoryId,
      });
    }
    return messages.map(() => ({ status: "ok" as const, id: `log-${newId()}` }));
  },
  async receipts(ticketIds) {
    return Object.fromEntries(ticketIds.map((ticketId) => [ticketId, { status: "ok" as const }]));
  },
};

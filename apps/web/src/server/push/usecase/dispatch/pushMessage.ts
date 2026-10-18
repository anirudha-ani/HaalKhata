/** Pure construction of one push message from one bell row: wording limits, grouping, badge and payload. */

import { pushRouteOf } from "@haalkhata/shared/notifications/categories";
import {
  PHONE_NUMBER_PATTERN,
  PUSH_BODY_MAX_LENGTH,
  PUSH_PAYLOAD_MAX_BYTES,
  PUSH_TIME_TO_LIVE_SECONDS,
  PUSH_TITLE_MAX_LENGTH,
} from "@/server/push/push.constants";
import type { PushMessage } from "@/server/push/usecase/provider/pushTypes";

/** The parts of a bell row a push is made from. */
export interface PushContent {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  link: string;
  actorId: string | null;
  /** The group of the expense the row links to, when it links to one. */
  expenseGroupId: string | null;
}

/**
 * Cuts text to a length, ending with an ellipsis when anything was removed.
 * Counts code points, so an emoji is never split in half.
 *
 * @param text - Text to fit.
 * @param maxLength - Longest result, in code points.
 * @returns The text, or its first part plus "…".
 */
export function fitText(text: string, maxLength: number): string {
  const codePoints = [...text.trim()];
  if (codePoints.length <= maxLength) return codePoints.join("");
  return `${codePoints.slice(0, maxLength - 1).join("").trimEnd()}…`;
}

/**
 * Hides all but the last two digits of every phone number in a text. A push
 * is shown on a lock screen and passes through two delivery services, so a
 * full number stays in the bell, never in a push.
 *
 * @param text - Title or body that may name a number.
 * @returns The text with each number reduced to "•••" and its last two digits.
 */
export function maskPhoneNumbers(text: string): string {
  return text.replace(PHONE_NUMBER_PATTERN, (number) => `•••${number.replace(/\D/g, "").slice(-2)}`);
}

/**
 * Picks the Notification Center thread a push joins: its group when known,
 * otherwise the other person, otherwise its category.
 *
 * @param content - The bell row.
 * @returns A stable thread id.
 */
export function pushThreadId(content: PushContent): string {
  if (content.expenseGroupId) return `group-${content.expenseGroupId}`;
  const [, route, identifier] = content.link.split("/");
  if (route === "groups" && identifier) return `group-${identifier}`;
  if (route === "friends" && identifier) return `person-${identifier}`;
  if (content.actorId) return `person-${content.actorId}`;
  return pushRouteOf(content.type) ?? "other";
}

/**
 * Builds the message for one bell row on one phone.
 *
 * The notification id is the collapse id, so a repeat after a crash replaces
 * the first banner instead of adding a second, and the data carries only what
 * the app needs to open the right screen.
 *
 * @param content - The bell row.
 * @param recipientId - Whose phone it is.
 * @param expoToken - The phone's push token.
 * @param unreadCount - The recipient's unread bell rows, for the badge.
 * @returns A message within the service's size limit.
 */
export function buildPushMessage(
  content: PushContent,
  recipientId: string,
  expoToken: string,
  unreadCount: number,
): PushMessage {
  const masked = content.type === "phone_transferred";
  const title = fitText(masked ? maskPhoneNumbers(content.title) : content.title, PUSH_TITLE_MAX_LENGTH);
  let body = fitText(masked ? maskPhoneNumbers(content.body) : content.body, PUSH_BODY_MAX_LENGTH);
  const message = (): PushMessage => ({
    to: expoToken,
    title,
    body,
    data: { notificationId: content.notificationId, link: content.link, recipientId },
    sound: "default",
    badge: Math.max(0, unreadCount),
    threadId: pushThreadId(content),
    collapseId: content.notificationId,
    categoryId: pushRouteOf(content.type) ?? "always",
    ttl: PUSH_TIME_TO_LIVE_SECONDS,
    priority: "high",
  });
  let built = message();
  // Wide characters can take four bytes each; shorten the body until the
  // whole message fits rather than have the service refuse it.
  while (Buffer.byteLength(JSON.stringify(built)) > PUSH_PAYLOAD_MAX_BYTES && body.length > 0) {
    const halfLength = Math.floor([...body].length / 2);
    body = halfLength < 2 ? "" : fitText(body, halfLength);
    built = message();
  }
  return built;
}

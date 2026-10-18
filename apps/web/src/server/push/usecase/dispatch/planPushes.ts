/** Pure decisions for one dispatch pass: which claimed rows go to which phones, which are dropped, and when to retry. */

import {
  DEFAULT_PUSH_PREFERENCES,
  shouldPushKind,
  type PushPreferenceValues,
} from "@haalkhata/shared/notifications/categories";
import {
  PUSH_MAX_AGE_SECONDS,
  PUSH_PAIR_CAP,
  PUSH_RETRY_DELAYS_SECONDS,
} from "@/server/push/push.constants";
import type { PushDeviceRow } from "@/server/push/repo/pushDevices.repo";
import type { ClaimedPushRow } from "@/server/push/repo/pushOutbox.repo";
import { buildPushMessage } from "@/server/push/usecase/dispatch/pushMessage";
import type { PushMessage } from "@/server/push/usecase/provider/pushTypes";

/** Everything one pass knows about its recipients. */
export interface PushPlanInput {
  rows: ClaimedPushRow[];
  devicesByUser: Map<string, PushDeviceRow[]>;
  preferencesByUser: Map<string, PushPreferenceValues>;
  unreadByUser: Map<string, number>;
  /** The pass's clock, in milliseconds since the epoch. */
  nowMs: number;
}

/** One message bound for one phone. */
export interface PlannedPush {
  notificationId: string;
  deviceId: string;
  /** The token the message goes to, recorded with its ticket. */
  expoToken: string;
  message: PushMessage;
}

/** The outcome of planning a pass. */
export interface PushPlan {
  /** Messages to send. */
  outgoing: PlannedPush[];
  /** Rows finished without a send: switched off, over the pair cap, unknown kind, or no live phone. */
  skipped: string[];
  /** Rows queued too long ago to be worth sending. */
  expired: string[];
}

/**
 * Whether a queued row is too old to send.
 *
 * @param queuedAt - When the row was queued (ISO 8601).
 * @param nowMs - The pass's clock.
 * @returns True once {@link PUSH_MAX_AGE_SECONDS} has passed.
 */
export function isExpired(queuedAt: string, nowMs: number): boolean {
  return nowMs - Date.parse(queuedAt) > PUSH_MAX_AGE_SECONDS * 1_000;
}

/**
 * Decides, for each claimed row, whether and where it is sent. A retried
 * row goes only to the phones an earlier attempt did not reach: a second
 * copy on a phone that already showed the first is a duplicate banner, since
 * a collapse id replaces only a notification still waiting to be shown.
 *
 * @param input - The claimed rows and what is known about their recipients.
 * @returns Messages to send and rows to finish without sending.
 */
export function planPushes(input: PushPlanInput): PushPlan {
  const plan: PushPlan = { outgoing: [], skipped: [], expired: [] };
  for (const claimedRow of input.rows) {
    if (isExpired(claimedRow.queued_at, input.nowMs)) {
      plan.expired.push(claimedRow.notification_id);
      continue;
    }
    const preferences = input.preferencesByUser.get(claimedRow.user_id) ?? DEFAULT_PUSH_PREFERENCES;
    const delivered = new Set(claimedRow.delivered_device_ids);
    const devices = (input.devicesByUser.get(claimedRow.user_id) ?? []).filter((device) => !delivered.has(device.id));
    if (
      !shouldPushKind(claimedRow.type, preferences) ||
      claimedRow.recent_from_actor > PUSH_PAIR_CAP ||
      devices.length === 0
    ) {
      plan.skipped.push(claimedRow.notification_id);
      continue;
    }
    const content = {
      notificationId: claimedRow.notification_id,
      type: claimedRow.type,
      title: claimedRow.title,
      body: claimedRow.body,
      link: claimedRow.link,
      actorId: claimedRow.actor_id,
      expenseGroupId: claimedRow.expense_group_id,
    };
    const unread = input.unreadByUser.get(claimedRow.user_id) ?? 0;
    for (const device of devices) {
      plan.outgoing.push({
        notificationId: claimedRow.notification_id,
        deviceId: device.id,
        expoToken: device.expo_token,
        message: buildPushMessage(content, claimedRow.user_id, device.expo_token, unread),
      });
    }
  }
  return plan;
}

/**
 * When a row that could not be handed over should be tried again.
 *
 * @param attempts - Claims so far, the failed one included.
 * @param queuedAt - When the row was queued (ISO 8601).
 * @param nowMs - The pass's clock.
 * @returns Seconds until the next attempt, or undefined to give up: out of
 *   attempts, or the next try would land past the age limit.
 */
export function retryDelaySeconds(attempts: number, queuedAt: string, nowMs: number): number | undefined {
  const delay = PUSH_RETRY_DELAYS_SECONDS.at(attempts - 1);
  if (delay === undefined) return undefined;
  const nextAttemptAge = nowMs + delay * 1_000 - Date.parse(queuedAt);
  return nextAttemptAge > PUSH_MAX_AGE_SECONDS * 1_000 ? undefined : delay;
}

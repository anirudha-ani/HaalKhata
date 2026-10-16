/** One pass of the push dispatcher: claim due outbox rows, drop what must not go out, send the rest, record the outcome. */

import type { PushPreferenceValues } from "@haalkhata/shared/notifications/categories";
import { logEvent } from "@/server/common/logger";
import {
  DEVICE_NOT_REGISTERED,
  PUSH_BATCH_SIZE,
  PUSH_LAST_ERROR_MAX_LENGTH,
  PUSH_LEASE_SECONDS,
  PUSH_PAIR_WINDOW_MINUTES,
  RETRYABLE_PUSH_ERRORS,
} from "@/server/push/push.constants";
import {
  deleteDeadPushDevicesForUsers,
  deletePushDevicesById,
  listLivePushDevicesForUsers,
  markPushDevicesSent,
  type PushDeviceRow,
} from "@/server/push/repo/pushDevices.repo";
import { claimDuePushes, completePushes, reschedulePushes, type PushRetry } from "@/server/push/repo/pushOutbox.repo";
import { listPushPreferences } from "@/server/push/repo/pushPreferences.repo";
import { insertPushTickets } from "@/server/push/repo/pushTickets.repo";
import { countUnreadByUsers } from "@/server/social/repo/notifications.repo";
import { planPushes, retryDelaySeconds, type PlannedPush } from "@/server/push/usecase/dispatch/planPushes";
import { pushProvider } from "@/server/push/usecase/provider/pushProvider";
import { PushTransportError, type PushProvider, type PushTicket } from "@/server/push/usecase/provider/pushTypes";

/** Counts from one pass, for the log line and for tests. */
export interface DrainReport {
  /** Rows claimed this pass. */
  claimed: number;
  /** Rows handed to the delivery service for at least one phone. */
  sent: number;
  /** Rows finished without a send: switched off, capped, unknown kind, no phone. */
  skipped: number;
  /** Rows scheduled for another attempt. */
  retried: number;
  /** Rows given up on: too old, out of attempts, or refused as malformed. */
  dropped: number;
}

/** What the sends of one pass came to, per row and per phone. */
interface SendOutcome {
  /** Rows to try again, with the error that caused it. */
  retry: Map<string, string>;
  /** Rows the service refused for good. */
  refused: Set<string>;
  /** Rows accepted for at least one phone. */
  accepted: Set<string>;
  tickets: { ticketId: string; deviceId: string }[];
  sentDeviceIds: string[];
  deadDeviceIds: string[];
}

/**
 * Turns a person's stored switches into the shared shape.
 *
 * @param preferenceRow - A push_preferences row.
 * @returns The five switches.
 */
function toPreferenceValues(preferenceRow: PushPreferenceValues): PushPreferenceValues {
  return {
    expenses: preferenceRow.expenses,
    comments: preferenceRow.comments,
    payments: preferenceRow.payments,
    groups: preferenceRow.groups,
    friends: preferenceRow.friends,
  };
}

/**
 * Groups phones by owner.
 *
 * @param devices - Live phones of the batch's recipients.
 * @returns Phones per user id.
 */
function devicesByOwner(devices: PushDeviceRow[]): Map<string, PushDeviceRow[]> {
  const grouped = new Map<string, PushDeviceRow[]>();
  for (const device of devices) {
    grouped.set(device.user_id, [...(grouped.get(device.user_id) ?? []), device]);
  }
  return grouped;
}

/**
 * Records one ticket's answer into the pass's outcome.
 *
 * @param outcome - The pass's running outcome.
 * @param planned - The message the ticket answers.
 * @param ticket - The service's answer.
 */
function recordTicket(outcome: SendOutcome, planned: PlannedPush, ticket: PushTicket): void {
  if (ticket.status === "ok") {
    outcome.accepted.add(planned.notificationId);
    outcome.tickets.push({ ticketId: ticket.id, deviceId: planned.deviceId });
    outcome.sentDeviceIds.push(planned.deviceId);
    return;
  }
  const errorCode = ticket.details?.error ?? "";
  if (errorCode === DEVICE_NOT_REGISTERED) {
    outcome.deadDeviceIds.push(planned.deviceId);
  } else if ((RETRYABLE_PUSH_ERRORS as readonly string[]).includes(errorCode)) {
    outcome.retry.set(planned.notificationId, `${errorCode}: ${ticket.message}`);
    if (errorCode === "InvalidCredentials") {
      logEvent("error", "push credentials refused", { notificationId: planned.notificationId, detail: ticket.message });
    }
  } else {
    outcome.refused.add(planned.notificationId);
    logEvent("error", "push refused", { notificationId: planned.notificationId, error: errorCode, detail: ticket.message });
  }
}

/**
 * Sends a pass's messages in service-sized batches. A batch that fails as a
 * whole marks each of its rows for retry when the failure is transient, and
 * refused when it is not.
 *
 * @param outgoing - Planned messages.
 * @param provider - Delivery service.
 * @returns What happened to every row and phone.
 */
async function sendAll(outgoing: PlannedPush[], provider: PushProvider): Promise<SendOutcome> {
  const outcome: SendOutcome = {
    retry: new Map(),
    refused: new Set(),
    accepted: new Set(),
    tickets: [],
    sentDeviceIds: [],
    deadDeviceIds: [],
  };
  for (let start = 0; start < outgoing.length; start += PUSH_BATCH_SIZE) {
    const batch = outgoing.slice(start, start + PUSH_BATCH_SIZE);
    try {
      const tickets = await provider.send(batch.map((planned) => planned.message));
      batch.forEach((planned, index) => recordTicket(outcome, planned, tickets[index]));
    } catch (error) {
      const transient = !(error instanceof PushTransportError) || error.retryable;
      const reason = error instanceof Error ? error.message : String(error);
      logEvent(transient ? "warn" : "error", "push batch failed", { provider: provider.name, size: batch.length, reason });
      for (const planned of batch) {
        if (transient) outcome.retry.set(planned.notificationId, reason);
        else outcome.refused.add(planned.notificationId);
      }
    }
  }
  return outcome;
}

/**
 * Runs one dispatch pass over at most one batch of due rows.
 *
 * Rows are claimed with a lease before any HTTP call, so no transaction is
 * held open across the service and a crash leaves them to be claimed again.
 * A row is finished once the service accepted it for every phone (or for some
 * and refused the rest for good); otherwise it is rescheduled with backoff
 * until it runs out of attempts or time. A repeat send is harmless: its
 * collapse id replaces the first banner.
 *
 * @param provider - Delivery service; the configured one by default.
 * @param nowMs - The pass's clock, for tests.
 * @returns Counts for this pass.
 */
export async function drainPushOutbox(
  provider: PushProvider = pushProvider(),
  nowMs: number = Date.now(),
): Promise<DrainReport> {
  const rows = await claimDuePushes(PUSH_BATCH_SIZE, PUSH_LEASE_SECONDS, PUSH_PAIR_WINDOW_MINUTES);
  const report: DrainReport = { claimed: rows.length, sent: 0, skipped: 0, retried: 0, dropped: 0 };
  if (rows.length === 0) return report;

  const recipientIds = [...new Set(rows.map((claimedRow) => claimedRow.user_id))];
  await deleteDeadPushDevicesForUsers(recipientIds);
  const [devices, preferenceRows, unreadByUser] = await Promise.all([
    listLivePushDevicesForUsers(recipientIds),
    listPushPreferences(recipientIds),
    countUnreadByUsers(recipientIds),
  ]);
  const plan = planPushes({
    rows,
    devicesByUser: devicesByOwner(devices),
    preferencesByUser: new Map(preferenceRows.map((preferenceRow) => [preferenceRow.user_id, toPreferenceValues(preferenceRow)])),
    unreadByUser,
    nowMs,
  });
  const outcome = await sendAll(plan.outgoing, provider);
  await insertPushTickets(outcome.tickets);
  await markPushDevicesSent([...new Set(outcome.sentDeviceIds)]);
  await deletePushDevicesById([...new Set(outcome.deadDeviceIds)]);

  const finished = [...plan.skipped, ...plan.expired];
  const retries: PushRetry[] = [];
  const attempted = new Set(plan.outgoing.map((planned) => planned.notificationId));
  for (const claimedRow of rows) {
    if (!attempted.has(claimedRow.notification_id)) continue;
    const retryError = outcome.retry.get(claimedRow.notification_id);
    if (retryError === undefined) {
      finished.push(claimedRow.notification_id);
      if (outcome.accepted.has(claimedRow.notification_id)) report.sent += 1;
      else if (outcome.refused.has(claimedRow.notification_id)) report.dropped += 1;
      else report.skipped += 1;
      continue;
    }
    const delay = retryDelaySeconds(claimedRow.attempts, claimedRow.queued_at, nowMs);
    if (delay === undefined) {
      finished.push(claimedRow.notification_id);
      report.dropped += 1;
      logEvent("error", "push given up", { notificationId: claimedRow.notification_id, attempts: claimedRow.attempts, error: retryError });
    } else {
      retries.push({
        notificationId: claimedRow.notification_id,
        delaySeconds: delay,
        error: retryError.slice(0, PUSH_LAST_ERROR_MAX_LENGTH),
      });
      report.retried += 1;
    }
  }
  report.skipped += plan.skipped.length;
  report.dropped += plan.expired.length;
  await completePushes(finished);
  await reschedulePushes(retries);
  logEvent("info", "push drain", { provider: provider.name, ...report });
  return report;
}

/** Reads delivery receipts for accepted pushes and forgets the phones that are gone. */

import { logEvent } from "@/server/common/logger";
import {
  DEVICE_NOT_REGISTERED,
  PUSH_DEVICE_STALE_DAYS,
  PUSH_RECEIPT_BATCH_SIZE,
  PUSH_RECEIPT_DELAY_MINUTES,
  PUSH_TICKET_MAX_AGE_HOURS,
} from "@/server/push/push.constants";
import { deletePushDevicesHoldingTokens, deleteStalePushDevices } from "@/server/push/repo/pushDevices.repo";
import { deleteExpiredPushTickets, deletePushTickets, listPushTicketsDue } from "@/server/push/repo/pushTickets.repo";
import { pushProvider } from "@/server/push/usecase/provider/pushProvider";
import type { PushProvider } from "@/server/push/usecase/provider/pushTypes";

/** Counts from one receipt pass. */
export interface ReceiptReport {
  /** Receipts read and their tickets removed. */
  checked: number;
  /** Phones removed because the app is no longer on them. */
  removedDevices: number;
  /** Receipts that reported some other failure (logged). */
  failed: number;
}

/**
 * Reads the receipts that are ready, at most one batch per pass.
 *
 * An accepted ticket only means the service took the message; the receipt,
 * ready about fifteen minutes later, says whether Apple or Google did. A
 * receipt of `DeviceNotRegistered` means the app is gone from that phone, so
 * the phone is removed. Tickets past the service's retention are deleted
 * unread, and phones nobody has opened in months are removed too.
 *
 * @param provider - Delivery service; the configured one by default.
 * @returns Counts for this pass.
 */
export async function checkPushReceipts(provider: PushProvider = pushProvider()): Promise<ReceiptReport> {
  await deleteExpiredPushTickets(PUSH_TICKET_MAX_AGE_HOURS);
  await deleteStalePushDevices(PUSH_DEVICE_STALE_DAYS);
  const tickets = await listPushTicketsDue(PUSH_RECEIPT_DELAY_MINUTES, PUSH_RECEIPT_BATCH_SIZE);
  const report: ReceiptReport = { checked: 0, removedDevices: 0, failed: 0 };
  if (tickets.length === 0) return report;

  const receipts = await provider.receipts(tickets.map((ticket) => ticket.ticket_id));
  const read: string[] = [];
  const deadDevices: { deviceId: string; expoToken: string }[] = [];
  for (const ticket of tickets) {
    const receipt = receipts[ticket.ticket_id];
    if (!receipt) continue;
    read.push(ticket.ticket_id);
    if (receipt.status === "ok") continue;
    if (receipt.details?.error === DEVICE_NOT_REGISTERED) {
      // Removed only while the phone still holds the token this send went
      // to; a reinstall since registered a new one. Tickets from before the
      // token was kept say nothing about which token died, so they remove
      // nothing.
      if (ticket.expo_token) deadDevices.push({ deviceId: ticket.device_id, expoToken: ticket.expo_token });
    } else {
      report.failed += 1;
      logEvent("warn", "push receipt error", {
        ticketId: ticket.ticket_id,
        error: receipt.details?.error ?? "",
        detail: receipt.message,
      });
    }
  }
  await deletePushDevicesHoldingTokens(deadDevices);
  await deletePushTickets(read);
  report.checked = read.length;
  report.removedDevices = deadDevices.length;
  logEvent("info", "push receipts", { provider: provider.name, ...report });
  return report;
}

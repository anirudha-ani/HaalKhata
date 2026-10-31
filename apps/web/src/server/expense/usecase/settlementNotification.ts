/** Concise payment notifications built from the scopes actually written, including net offsets. */

import { formatMoney } from "@haalkhata/shared/money/money";
import { personNotification, type NotificationWords } from "@/server/social/usecase/personNotification";
import { notificationLabel } from "@/server/social/usecase/notificationLabel";

/** A payment's cash or offset row, reduced to where it belongs. */
interface PaymentScope {
  group_id: string | null;
}

/**
 * Describes every scope the payment touched, including cancelled balances.
 * A net payment must not masquerade as a payment in just one of its groups.
 *
 * @param rows - All rows in the stored or removed payment.
 * @param groupsById - The corresponding groups, loaded on the transaction.
 * @returns A group name, a group count, and/or the one-off scope.
 */
export function settlementLocation(
  rows: readonly PaymentScope[],
  groupsById: ReadonlyMap<string, { name: string }>,
): string {
  const groupIds = [...new Set(rows.flatMap((entry) => entry.group_id ? [entry.group_id] : []))];
  const hasOneOff = rows.some((entry) => entry.group_id === null);
  const groupLabel = groupIds.length === 1
    ? notificationLabel(groupsById.get(groupIds[0])?.name ?? "1 group")
    : groupIds.length > 1 ? `${groupIds.length} groups` : "";
  return [groupLabel, hasOneOff ? "One-off expenses" : ""].filter(Boolean).join(" + ");
}

/** Payment facts, relative to the person receiving the notification. */
export interface SettlementNotice {
  actorName: string;
  amountCents: number;
  currency: string;
  /** True when the reader paid the actor. */
  paidByReader: boolean;
  location: string;
  removed?: boolean;
  /** Only net settlements have a known remaining overall amount. */
  remainingCents?: number;
  cancelledCents?: number;
}

/**
 * Puts the recorded amount and direction before the scope and net outcome.
 * Recording an external payment never claims the app transferred any money.
 *
 * @param notice - Facts from the committed payment, or the unit being removed.
 * @returns The actor's name and a concrete, recipient-relative message.
 */
export function settlementNotification(notice: SettlementNotice): NotificationWords {
  const amount = formatMoney(notice.amountCents, notice.currency);
  const direction = notice.paidByReader ? "from you" : "to you";
  const action = notice.removed
    ? `Removed ${amount} payment ${direction}`
    : `Recorded ${amount} ${direction}`;
  const outcome = notice.removed
    ? "Balances restored"
    : notice.remainingCents === undefined ? ""
      : notice.remainingCents === 0 ? `Settled up in ${notice.currency}`
        : `${notice.paidByReader ? "You still owe" : "They still owe you"} ${formatMoney(notice.remainingCents, notice.currency)}`;
  const cancelledCents = notice.cancelledCents ?? 0;
  const cancelled = cancelledCents > 0
    ? `${formatMoney(cancelledCents, notice.currency)} ${notice.removed ? "owed again" : "cancelled"} each way`
    : "";
  return personNotification(notice.actorName, action, notice.location, outcome, cancelled);
}

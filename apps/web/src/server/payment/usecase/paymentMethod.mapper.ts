/** Payment method rows → payment.v1 message init shapes. */

import { findDetailKind } from "@haalkhata/shared/payment/detailKinds";
import { stripHiddenCharacters } from "@haalkhata/shared/text/hiddenCharacters";
import type { PaymentMethodRow } from "@/server/payment/repo/paymentMethods.repo";

/**
 * A stored method with nothing in it that a reader cannot see.
 *
 * Everything saved through the validator is already clean. This is for the
 * rows that never went through it: the handles copied in by the backfill
 * migration, and anything saved before the validator removed hidden
 * characters. Cleaning them where they leave the database means a payer is
 * never shown one thing and handed another to copy, whatever the row holds.
 *
 * @param methodRow - The stored method with its details.
 * @returns The same row with hidden characters removed from its name, note,
 *   labels and values.
 */
export function cleanMethodRow(methodRow: PaymentMethodRow): PaymentMethodRow {
  return {
    ...methodRow,
    name: stripHiddenCharacters(methodRow.name, true),
    note: stripHiddenCharacters(methodRow.note, true),
    details: methodRow.details.map((detail) => ({
      kind: detail.kind,
      label: stripHiddenCharacters(detail.label, true),
      value: stripHiddenCharacters(detail.value, findDetailKind(detail.kind)?.prose ?? false),
    })),
  };
}

/**
 * Maps a payment method row to a payment.v1 PaymentMethod message init shape.
 *
 * @param methodRow - The stored method with its details.
 * @returns An object matching the PaymentMethod proto message fields, with
 *   the nullable currency and preset spelled as empty strings and hidden
 *   characters removed (see {@link cleanMethodRow}).
 */
export function toPaymentMethod(methodRow: PaymentMethodRow) {
  const cleaned = cleanMethodRow(methodRow);
  return {
    id: cleaned.id,
    name: cleaned.name,
    currency: cleaned.currency ?? "",
    preset: cleaned.preset ?? "",
    details: cleaned.details,
    note: cleaned.note,
    preferred: cleaned.is_preferred,
    updatedAt: cleaned.updated_at,
    createdAt: cleaned.created_at,
    preferredAt: cleaned.preferred_at ?? "",
  };
}

/** Payment method rows → payment.v1 message init shapes. */

import type { PaymentMethodRow } from "@/server/payment/repo/paymentMethods.repo";

/**
 * Maps a payment method row to a payment.v1 PaymentMethod message init shape.
 *
 * @param methodRow - The stored method with its details.
 * @returns An object matching the PaymentMethod proto message fields, with
 *   the nullable currency and preset spelled as empty strings.
 */
export function toPaymentMethod(methodRow: PaymentMethodRow) {
  return {
    id: methodRow.id,
    name: methodRow.name,
    currency: methodRow.currency ?? "",
    preset: methodRow.preset ?? "",
    details: methodRow.details.map((detail) => ({
      kind: detail.kind,
      label: detail.label,
      value: detail.value,
    })),
    note: methodRow.note,
    preferred: methodRow.is_preferred,
    updatedAt: methodRow.updated_at,
    createdAt: methodRow.created_at,
  };
}

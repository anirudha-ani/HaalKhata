"use client";
/** The payment methods a settle dialog offers for a currency, and which one is selected. */

import { useState } from "react";
import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { errorMessage } from "@/lib/api/connect";
import { usePaymentMethodsAPI } from "@/lib/hooks/usePaymentMethodsAPI";
import {
  PLAIN_PAY_CHOICES,
  defaultPayChoice,
  methodsForCurrency,
  settlementMethodKey,
} from "@haalkhata/shared/payment/payeeMethods";

/**
 * Works out what "How" offers and what it has selected.
 *
 * Whose methods these are follows the direction of the payment. Paying
 * someone, they are that person's: where to send the money. Recording money
 * received, they are the caller's own: how it arrived. The payee's travel
 * on the friend ledger the dialog already loads; the caller's own are
 * fetched here, and only when that direction needs them.
 *
 * The selection is a method's id or a plain choice's key. Until the person
 * picks one it is derived, not stored, so it follows the currency: switch
 * from BDT to USD and the dialog moves from bKash to Zelle on its own.
 *
 * @param options - The payee's methods, the payment's currency, and its direction.
 * @returns The methods usable in the currency and the rest, the selection
 *   with its method (if it is one), the settlement key to record, and the
 *   actions that change the selection.
 */
export function usePayMethods({
  payeeMethods,
  currency,
  received,
}: {
  /** The other person's methods from the friend ledger; empty unless the caller owes them. */
  payeeMethods: readonly PaymentMethod[];
  /** ISO 4217 code of the payment. */
  currency: string;
  /** True when the dialog records money the caller received. */
  received: boolean;
}) {
  const { methodsQuery: ownMethodsQuery } = usePaymentMethodsAPI({ enabled: received });
  const offered = received ? (ownMethodsQuery.data?.methods ?? []) : payeeMethods;
  const { usable, others } = methodsForCurrency(offered, currency);

  const [picked, setPicked] = useState("");
  // A pick made under another currency, or for the other direction, names a
  // method that is no longer on screen: fall back to the default rather
  // than record a payment against something the person cannot see.
  const pickedStillOffered =
    offered.some((candidate) => candidate.id === picked) ||
    PLAIN_PAY_CHOICES.some((plain) => plain.key === picked);
  const choice = pickedStillOffered ? picked : defaultPayChoice(usable, currency);
  const method = offered.find((candidate) => candidate.id === choice);

  return {
    usable,
    /** Methods tied to another currency; offered apart, since the amount would need converting. */
    others,
    /** Whether the person being paid has any method at all. */
    hasAnyMethod: offered.length > 0,
    choice,
    /** The selected payment method; undefined for Cash and Other. */
    method,
    /** The key the settlement is recorded under for this selection. */
    settlementKey: settlementMethodKey(choice, method),
    pick: setPicked,
    /** Forgets the pick, so the selection goes back to following the currency. */
    resetPick: () => setPicked(""),
    /**
     * Why the caller's own methods could not be read, when recording money
     * received; "" otherwise. Without it the choices would quietly shrink
     * to Cash and Other, as though the person had no methods at all.
     */
    ownMethodsError:
      received && ownMethodsQuery.error ? errorMessage(ownMethodsQuery.error) : "",
    /** Reads the caller's own methods again. */
    retryOwnMethods: () => void ownMethodsQuery.refetch(),
  };
}

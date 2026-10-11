/** State of the "Get paid" section: the list, which method the sheet is open on, and the star's feedback. */

import { useState } from "react";
import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { errorMessage } from "@/lib/api/connect";
import { MAX_PAYMENT_METHODS_PER_USER } from "@haalkhata/shared/payment/payment.constants";
import { usePaymentMethodsAPI } from "./usePaymentMethodsAPI";

/** What the add-and-edit sheet is open on: nothing, a new method, or an existing one. */
type SheetTarget = { kind: "closed" } | { kind: "new" } | { kind: "edit"; method: PaymentMethod };

/**
 * Composes the payment-method list with the section's own state.
 *
 * @returns The methods and their load state, the sheet target with its open
 *   and close actions, the star action with the row it last failed on, and
 *   whether another method can be added.
 */
export function usePaymentMethods() {
  const { methodsQuery, star } = usePaymentMethodsAPI();
  const [sheet, setSheet] = useState<SheetTarget>({ kind: "closed" });
  // Shown under the row whose star was refused, not in a corner of the
  // screen: the list can be long and the tap happened on one line of it.
  const [starError, setStarError] = useState({ methodId: "", message: "" });

  const methods = methodsQuery.data?.methods ?? [];

  /**
   * Flips the star on a method. The row changes at once; a refusal puts it
   * back and says why under that row.
   *
   * @param method - The method whose star was tapped.
   */
  const toggleStar = (method: PaymentMethod) => {
    // One star change at a time. Two in flight could finish out of order,
    // and the refusal of the first would be undone on screen by the second
    // without ever being shown.
    if (star.isPending) return;
    setStarError({ methodId: "", message: "" });
    star.mutate(
      { id: method.id, preferred: !method.preferred },
      {
        onError: (mutationError) =>
          setStarError({ methodId: method.id, message: errorMessage(mutationError) }),
      },
    );
  };

  return {
    methods,
    isLoading: methodsQuery.isPending,
    loadError: methodsQuery.error ? errorMessage(methodsQuery.error) : "",
    retryLoad: () => void methodsQuery.refetch(),
    sheet,
    openNew: () => setSheet({ kind: "new" }),
    openEdit: (method: PaymentMethod) => setSheet({ kind: "edit", method }),
    closeSheet: () => setSheet({ kind: "closed" }),
    toggleStar,
    /** True while a star change is on its way; the stars wait for it. */
    isStarring: star.isPending,
    starError,
    /** False at the cap, where the Add button says why instead of failing after a tap. */
    canAdd: methods.length < MAX_PAYMENT_METHODS_PER_USER,
  };
}

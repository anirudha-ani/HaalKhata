"use client";
/** Payment-method data: the list query and the create, update, remove and star mutations. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListPaymentMethodsResponse } from "@haalkhata/protogen/payment/v1/payment_pb";
import { paymentClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { PaymentMethodFields } from "@haalkhata/shared/payment/types";

/** What the form sends for a method: its typed fields and the "preferred" box. */
export type PaymentMethodSave = PaymentMethodFields & { preferred: boolean };

/**
 * Wraps every RPC that reads or changes the caller's own payment methods.
 * A cross-route hook: the account page, onboarding and the Home prompt all
 * manage the same list.
 *
 * Saves and removals refetch the list rather than patching it: a save can
 * move the star off another method, and the server's answer is the only
 * place that is written down. The star is the exception. It is one tap on a
 * row, so it shows at once and is put back if the server refuses.
 *
 * @param options - `enabled: false` holds the list query back, for a screen
 *   that only needs the list in some states.
 * @returns The list query and the four mutations.
 */
export function usePaymentMethodsAPI({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const methodsQuery = useQuery({
    queryKey: queryKeys.paymentMethods,
    queryFn: () => paymentClient.listMyPaymentMethods({}),
    enabled,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods });

  const create = useMutation({
    mutationFn: (save: PaymentMethodSave) =>
      paymentClient.createPaymentMethod({
        ...save,
        details: save.details.map((detail) => ({ ...detail })),
      }),
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: (save: PaymentMethodSave & { id: string }) =>
      paymentClient.updatePaymentMethod({
        ...save,
        details: save.details.map((detail) => ({ ...detail })),
      }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (methodId: string) => paymentClient.deletePaymentMethod({ id: methodId }),
    onSuccess: refresh,
  });

  const star = useMutation({
    mutationFn: (change: { id: string; preferred: boolean }) =>
      paymentClient.setPreferredPaymentMethod(change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.paymentMethods });
      const previous = queryClient.getQueryData<ListPaymentMethodsResponse>(
        queryKeys.paymentMethods,
      );
      if (previous) {
        const starred = previous.methods.find((method) => method.id === change.id);
        queryClient.setQueryData<ListPaymentMethodsResponse>(queryKeys.paymentMethods, {
          ...previous,
          methods: previous.methods.map((method) => {
            if (method.id === change.id) return { ...method, preferred: change.preferred };
            // One star per currency: taking it clears the one it displaces.
            const displaced = change.preferred && method.currency === starred?.currency;
            return displaced ? { ...method, preferred: false } : method;
          }),
        });
      }
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.paymentMethods, context.previous);
      }
      // The snapshot is only what this tap saw. Reading the list again is
      // what makes the stars on screen the server's, whatever else moved.
      void refresh();
    },
    // The response is the whole list as the server now has it.
    onSuccess: (result) => queryClient.setQueryData(queryKeys.paymentMethods, result),
  });

  return { methodsQuery, create, update, remove, star };
}

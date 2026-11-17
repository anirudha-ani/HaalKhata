/** Rechecks a bill at the moment the payer asks to leave for a payment app. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { COMMENT_PAGE_SIZE } from "@haalkhata/shared/api/paging";
import { billPaymentError } from "@haalkhata/shared/expense/repayment";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { expenseClient } from "@/lib/api/connect";

/**
 * @param expenseId - Bill to reread directly from the server.
 * @param creditorId - Recipient chosen on this bill.
 * @returns A mutation that authorizes one payment handoff for the requested amount.
 */
export function useBillPaymentLinkAPI(expenseId: string, creditorId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (amountCents: number) => {
      const detailKey = queryKeys.expense(expenseId);
      // A background read started before this tap may still carry the old balance.
      await cache.cancelQueries({ queryKey: detailKey, exact: true });
      const detail = await cache.fetchQuery({
        queryKey: detailKey,
        queryFn: ({ signal }) => expenseClient.getExpense({ expenseId, commentLimit: COMMENT_PAGE_SIZE }, { signal }),
        staleTime: 0,
        networkMode: "always",
        retry: false,
      });
      const payee = detail.repayments.find((repayment) => repayment.userId === creditorId);
      const refusal = payee?.refusal || billPaymentError(amountCents, payee?.payableCents ?? 0, detail.expense?.currency ?? "");
      if (refusal) throw new Error(refusal);
    },
    networkMode: "always",
    retry: false,
  });
}

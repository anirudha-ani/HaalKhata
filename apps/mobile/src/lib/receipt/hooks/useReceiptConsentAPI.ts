/** Account receipt permission queries and mutations for this app's authenticated transport. */

import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RECEIPT_CONSENT_COPY } from "@haalkhata/shared/receipt/consent";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { receiptClient } from "@/lib/api/connect";

/** Rejects offline requests immediately instead of queuing a later permission change or upload. */
function assertOnline() {
  if (!onlineManager.isOnline()) throw new Error(RECEIPT_CONSENT_COPY.offline);
}

/** @returns Current permission, explicit grant/withdraw mutations, and a fresh pre-upload read. */
export function useReceiptConsentAPI() {
  const queryClient = useQueryClient();
  const information = useQuery({ queryKey: queryKeys.receiptProcessingInfo,
    queryFn: () => { assertOnline(); return receiptClient.getProcessingInfo({}); },
    staleTime: 0, retry: false, networkMode: "always" });
  const grant = useMutation({
    mutationFn: async (consentVersion: string) => { assertOnline(); return receiptClient.grantConsent({ consentVersion }); },
    retry: false, networkMode: "always",
    onSuccess: (result) => queryClient.setQueryData(queryKeys.receiptProcessingInfo, result),
  });
  const revoke = useMutation({
    mutationFn: async () => { assertOnline(); return receiptClient.revokeConsent({}); },
    retry: false, networkMode: "always",
    onSuccess: (result) => queryClient.setQueryData(queryKeys.receiptProcessingInfo, result),
  });
  /** @returns Server permission checked now, even when another screen has cached an allowance. */
  const refresh = async () => {
    const result = await information.refetch({ throwOnError: true });
    if (!result.data) throw new Error("Could not check receipt-sharing permission. Try again.");
    return result.data;
  };
  return { information, grant, revoke, refresh };
}

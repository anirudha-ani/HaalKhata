/** Visible account feedback for receipt-permission loading and withdrawal. */

import { useState } from "react";
import { RECEIPT_CONSENT_COPY } from "@haalkhata/shared/receipt/consent";
import { errorMessage } from "@/lib/api/connect";
import { useReceiptConsentAPI } from "@/lib/receipt/hooks/useReceiptConsentAPI";

/** @returns Saved status and a withdrawal action shared with the scanning query cache. */
export function useReceiptPermission() {
  const consentAPI = useReceiptConsentAPI();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  /** Withdraws on the server before showing success; failed requests leave permission intact. */
  const withdraw = async () => {
    setNotice(""); setError("");
    try { await consentAPI.revoke.mutateAsync(); setNotice(RECEIPT_CONSENT_COPY.withdrawn); }
    catch (failure) { setError(errorMessage(failure)); }
  };
  /** Retries a failed status read without changing permission. */
  const retry = async () => {
    setError("");
    try { await consentAPI.refresh(); } catch (failure) { setError(errorMessage(failure)); }
  };
  return { information: consentAPI.information.data, loading: consentAPI.information.isPending,
    busy: consentAPI.revoke.isPending, notice, withdraw, retry,
    error: error || (consentAPI.information.error ? errorMessage(consentAPI.information.error) : "") };
}

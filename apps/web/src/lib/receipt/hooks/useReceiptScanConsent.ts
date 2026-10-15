/** First-use permission flow; subsequent selected photos reuse the account's saved choice. */

import { useEffect, useRef, useState } from "react";
import type { ReceiptProcessingInfo } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { errorMessage } from "@/lib/api/connect";
import { useReceiptConsentAPI } from "./useReceiptConsentAPI";

/** @param scan Starts the explicitly requested scan. @returns First-use prompt state and actions. */
export function useReceiptScanConsent(scan: (version: string) => void) {
  const consentAPI = useReceiptConsentAPI();
  const [prompt, setPrompt] = useState<ReceiptProcessingInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /** Checks the account before accessing/uploading image bytes, then scans or opens the prompt. */
  const request = async () => {
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    try {
      const information = await consentAPI.refresh();
      if (!mounted.current) return;
      if (information.consentGranted) scan(information.consentVersion);
      else setPrompt(information);
    } catch (failure) { if (mounted.current) setError(errorMessage(failure)); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };

  /** Saves only the displayed terms, then performs the scan that opened the prompt. */
  const allow = async () => {
    if (!prompt || working.current) return;
    working.current = true; setBusy(true); setError("");
    try {
      const information = await consentAPI.grant.mutateAsync(prompt.consentVersion);
      if (!mounted.current) return;
      setPrompt(null); scan(information.consentVersion);
    } catch (failure) {
      if (!mounted.current) return;
      setError(errorMessage(failure));
      // A changed disclosure is shown afresh, and requires another deliberate Allow.
      try { const information = await consentAPI.refresh(); if (mounted.current) setPrompt(information); }
      catch { /* Keep the visible failure and the original terms; allow can be retried. */ }
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  };

  /** Dismissal never grants permission or uploads an image. */
  const decline = () => { if (!working.current) { setPrompt(null); setError(""); } };
  return { prompt, busy, error, request, allow, decline };
}

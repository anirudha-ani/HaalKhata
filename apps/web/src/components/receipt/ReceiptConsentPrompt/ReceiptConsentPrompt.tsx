"use client";
/** First-use receipt permission dialog; choosing manual entry never sends the photo. */

import { RECEIPT_CONSENT_COPY } from "@haalkhata/shared/receipt/consent";
import { LegalLinks } from "@/components/legal/LegalLinks/LegalLinks";
import { Modal } from "@/components/ui/Modal/Modal";
import type { useReceiptScanConsent } from "@/lib/receipt/hooks/useReceiptScanConsent";

/** @param props Permission flow. @returns The first-use dialog, only when explicitly requested. */
export function ReceiptConsentPrompt({ consent }: { consent: ReturnType<typeof useReceiptScanConsent> }) {
  if (!consent.prompt) return null;
  return <Modal title={RECEIPT_CONSENT_COPY.title} onClose={consent.decline} footer={
    <div className="grid gap-2">
      <button type="button" disabled={consent.busy} onClick={() => void consent.allow()}
        className="min-h-12 rounded-xl bg-brand-600 px-4 font-semibold text-white disabled:opacity-60">
        {consent.busy ? "Saving permission…" : RECEIPT_CONSENT_COPY.allow}
      </button>
      <button type="button" disabled={consent.busy} onClick={consent.decline}
        className="min-h-12 rounded-xl border border-line px-4 font-semibold disabled:opacity-60">{RECEIPT_CONSENT_COPY.decline}</button>
    </div>
  }>
    <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
      <p>{consent.prompt.disclosure}</p>
      <p>{RECEIPT_CONSENT_COPY.remember}</p>
      <LegalLinks />
      {consent.error ? <p role="alert" className="text-neg-700">{consent.error}</p> : null}
    </div>
  </Modal>;
}

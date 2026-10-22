"use client";
/** Account-wide receipt permission with an immediate withdrawal control. */

import { RECEIPT_CONSENT_COPY } from "@haalkhata/shared/receipt/consent";
import { useReceiptPermission } from "./hooks/useReceiptPermission";

/**
 * @param props - Whether the containing settings section supplies the card.
 * @returns Account permission status and feedback, independent of the profile form.
 */
export function ReceiptPermission({ embedded = false }: { embedded?: boolean }) {
  const permission = useReceiptPermission();
  return <section className={embedded ? "space-y-2" : "space-y-3 rounded-2xl border border-line bg-card p-5"} aria-label={RECEIPT_CONSENT_COPY.settingTitle}>
    {embedded ? <h3 className="font-semibold">{RECEIPT_CONSENT_COPY.settingTitle}</h3> : <h2 className="font-semibold">{RECEIPT_CONSENT_COPY.settingTitle}</h2>}
    {permission.loading ? <p className="text-sm text-ink-soft">Loading permission…</p> : permission.information ? <>
      <p className="text-sm text-ink-soft">{permission.information.consentGranted ? RECEIPT_CONSENT_COPY.enabled : RECEIPT_CONSENT_COPY.disabled}</p>
      {permission.information.consentGranted ? <>
        <p className="text-sm text-ink-soft">{permission.information.disclosure}</p>
        <button type="button" disabled={permission.busy} onClick={() => void permission.withdraw()}
          className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-60">
          {permission.busy ? "Withdrawing…" : RECEIPT_CONSENT_COPY.withdraw}
        </button>
      </> : null}
    </> : null}
    {permission.error ? <div className="space-y-2"><p role="alert" className="text-sm text-neg-700">{permission.error}</p>
      <button type="button" className="text-sm underline" onClick={() => void permission.retry()}>Refresh permission</button></div> : null}
    {permission.notice ? <p role="status" className="text-sm text-pos-700">{permission.notice}</p> : null}
  </section>;
}

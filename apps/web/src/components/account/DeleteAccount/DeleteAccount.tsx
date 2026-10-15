"use client";
/** Irreversible account deletion with typed confirmation and inline failures. */

import { ACCOUNT_DELETION_CONFIRMATION, ACCOUNT_ERASURE_MESSAGE, SHARED_LEDGER_ERASURE_MESSAGE } from "@haalkhata/shared/account/deletion";
import { formatMoney } from "@haalkhata/shared/money/money";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal/Modal";
import { useDeleteAccountAPI } from "./hooks/useDeleteAccountAPI";

/**
 * Shows account erasure effects and submits only after an explicit confirmation.
 * @returns Delete button and confirmation dialog.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const deletion = useDeleteAccountAPI(open);
  const review = deletion.balanceReview;
  return <>
    <button type="button" className="w-full py-3 text-sm font-semibold text-neg-700 underline"
      onClick={() => { setConfirmation(""); deletion.reset(); setOpen(true); }}>Delete account</button>
    {open ? <Modal title="Permanently delete your account" onClose={() => { if (!deletion.isPending) setOpen(false); }}
      footer={<div className="space-y-3">
        {deletion.error ? <p role="alert" className="text-sm text-neg-700">{deletion.error}</p> : null}
        <button type="button" disabled={confirmation !== ACCOUNT_DELETION_CONFIRMATION || deletion.isPending}
          className="w-full rounded-lg border border-neg-700 p-3 font-semibold text-neg-700 disabled:opacity-50"
          onClick={() => deletion.remove(confirmation)}>{deletion.isPending ? "Deleting…" : review.deleteLabel}</button>
        <button type="button" className="w-full rounded-lg border border-line p-3" disabled={deletion.isPending}
          onClick={() => setOpen(false)}>Keep my account</button>
      </div>}>
      <div className="space-y-4">
        <section aria-label="Balances before deletion" className="space-y-3 rounded-lg border border-line bg-paper p-3">
          <h4 className="font-semibold">Your outstanding balances</h4>
          <p role={review.status === "unavailable" ? "alert" : "status"} className="text-sm text-ink-soft">{review.message}</p>
          {review.totals.map((total) => <div key={total.currency} className="space-y-1 text-sm">
            <h5 className="font-semibold">{total.currency}</h5>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              <dt>You owe</dt><dd className="text-right tabular-nums">{formatMoney(total.youOweCents, total.currency)}</dd>
              <dt>You are owed</dt><dd className="text-right tabular-nums">{formatMoney(total.owedToYouCents, total.currency)}</dd>
            </dl>
          </div>)}
          {review.status === "unavailable" ? <button type="button" disabled={deletion.isPending}
            className="font-semibold text-brand-600 underline" onClick={deletion.retryBalances}>Retry balance check</button> : null}
          <button type="button" disabled={deletion.isPending}
            className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white disabled:opacity-50"
            onClick={() => { setOpen(false); deletion.reviewBalances(); }}>Review balances</button>
        </section>
        <p className="text-sm text-ink-soft">{ACCOUNT_ERASURE_MESSAGE}</p>
        <p className="text-sm text-ink-soft">{SHARED_LEDGER_ERASURE_MESSAGE}</p>
        <label className="block text-sm font-semibold">Type DELETE to confirm
          <input className="mt-2 w-full rounded-lg border border-line p-3" value={confirmation} disabled={deletion.isPending}
            onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        </label>
      </div>
    </Modal> : null}
  </>;
}

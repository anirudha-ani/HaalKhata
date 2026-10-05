"use client";
/** Irreversible account deletion with typed confirmation and inline failures. */

import { ACCOUNT_DELETION_CONFIRMATION, ACCOUNT_ERASURE_MESSAGE, SHARED_LEDGER_ERASURE_MESSAGE } from "@haalkhata/shared/account/deletion";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useDeleteAccountAPI } from "./hooks/useDeleteAccountAPI";

/**
 * Shows account erasure effects and submits only after an explicit confirmation.
 * @returns Delete button and confirmation dialog.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const deletion = useDeleteAccountAPI();
  return <>
    <button type="button" className="w-full py-3 text-sm font-semibold text-neg-700 underline"
      onClick={() => { setConfirmation(""); deletion.reset(); setOpen(true); }}>Delete account</button>
    {open ? <Modal title="Permanently delete your account" onClose={() => { if (!deletion.isPending) setOpen(false); }}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">{ACCOUNT_ERASURE_MESSAGE}</p>
        <p className="text-sm text-ink-soft">{SHARED_LEDGER_ERASURE_MESSAGE}</p>
        <label className="block text-sm font-semibold">Type DELETE to confirm
          <input className="mt-2 w-full rounded-lg border border-line p-3" value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        </label>
        {deletion.error ? <p role="alert" className="text-sm text-neg-700">{deletion.error}</p> : null}
        <button type="button" disabled={confirmation !== ACCOUNT_DELETION_CONFIRMATION || deletion.isPending}
          className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white disabled:opacity-50"
          onClick={() => deletion.remove(confirmation)}>{deletion.isPending ? "Deleting…" : "Permanently delete account"}</button>
        <button type="button" className="w-full rounded-lg border border-line p-3" disabled={deletion.isPending}
          onClick={() => setOpen(false)}>Keep my account</button>
      </div>
    </Modal> : null}
  </>;
}

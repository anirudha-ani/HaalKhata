"use client";
/** Modal for recording a settlement payment to another user. */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { centsToInput, formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MONEY_KEYS } from "@haalkhata/shared/api/queryKeys";
import { SETTLEMENT_METHODS } from "./modals.constants";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";

/**
 * Renders a modal for recording a settlement payment: the signed-in user pays
 * `to`. Shows the recipient, an editable amount pre-filled with the suggested
 * outstanding balance, a payment method picker, and an optional note; on
 * success it invalidates all money-related queries and closes itself.
 */
export function SettleUpModal({
  to: recipient,
  suggestedCents,
  currency,
  groupId = "",
  onClose,
}: {
  /** The user receiving the payment. */
  to: User;
  /** Suggested amount in cents (the outstanding balance); pre-fills the input. */
  suggestedCents: number;
  /** ISO 4217 currency code of the settlement. */
  currency: string;
  /** Group to record the settlement in; empty string means a direct (non-group) settlement. */
  groupId?: string;
  /** Called when the modal is dismissed or the settlement is recorded. */
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(() => centsToInput(Math.max(suggestedCents, 0)));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (amountCents: number) =>
      expenseClient.recordSettlement({
        groupId,
        toUserId: recipient.id,
        amountCents,
        currency,
        method,
        note,
      }),
    onSuccess: () => {
      for (const moneyKey of MONEY_KEYS) queryClient.invalidateQueries({ queryKey: moneyKey });
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Validates the typed amount and fires the record-settlement mutation. */
  const submit = () => {
    const cents = parseMoneyInput(amount);
    if (cents === null || cents <= 0) {
      setError("enter a valid amount");
      return;
    }
    mutation.mutate(cents);
  };

  return (
    <Modal title="Settle up" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-paper p-3">
          <Avatar user={recipient} />
          <div className="text-sm">
            <p>
              You pay <span className="font-semibold">{recipient.name}</span>
            </p>
            {suggestedCents > 0 ? (
              <p className="text-ink-soft">
                outstanding: {formatMoney(suggestedCents, currency)}
              </p>
            ) : null}
          </div>
        </div>

        <label className="block text-sm font-medium">
          Amount ({currency})
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(changeEvent) => setAmount(changeEvent.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-lg tabular-nums focus:border-brand-500 focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {SETTLEMENT_METHODS.map((methodOption) => (
            <button
              key={methodOption}
              type="button"
              onClick={() => setMethod(methodOption)}
              className={`rounded-full border px-3 py-1.5 text-sm capitalize ${
                method === methodOption
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-line text-ink-soft"
              }`}
            >
              {methodOption}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Note (optional)"
          aria-label="Note"
          value={note}
          onChange={(changeEvent) => setNote(changeEvent.target.value)}
          className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
        />

        {error ? <p className="text-sm text-brand-600">{error}</p> : null}

        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending}
          className="w-full rounded-xl bg-pos-600 py-3 font-semibold text-white transition-colors hover:bg-pos-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Recording…" : "Record payment"}
        </button>
      </div>
    </Modal>
  );
}

"use client";
/** Modal for settling up: pick the app, copy or open the recipient's handle, then record it. */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { centsToInput, formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MONEY_KEYS } from "@haalkhata/shared/api/queryKeys";
import { PAYMENT_METHODS, findPaymentMethod, paymentLink } from "@haalkhata/shared/payment/methods";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";

/**
 * Renders the settle-up modal: who is paying whom, the amount, which app the
 * money moves through, and — the part that actually saves time — the
 * recipient's handle for that app, ready to copy or open.
 *
 * Two things this deliberately does not pretend:
 * - It never moves money. It records that a payment happened, which is stated
 *   on the button's own line rather than left to be discovered.
 * - It only offers a link where one exists and only claims a prefilled amount
 *   where the app accepts one — Zelle has no universal link at all and Cash
 *   App cannot carry an amount.
 *
 * The handle block appears only when *you* are the one paying. Recording a
 * payment received logs money that has already arrived: there is nobody to
 * send anything to, and surfacing your own handle there would offer a link
 * that opens Venmo to pay yourself. Telling someone where to send money is the
 * reminder's job, not this form's.
 */
export function SettleUpModal({
  to: other,
  suggestedCents,
  currency,
  groupId = "",
  received = false,
  onClose,
}: {
  /** The other person, whichever way the money moved. */
  to: User;
  /** Suggested amount in cents (the outstanding balance); pre-fills the input. */
  suggestedCents: number;
  /** ISO 4217 currency code of the settlement. */
  currency: string;
  /** Group to record the settlement in; empty string means a direct (non-group) settlement. */
  groupId?: string;
  /** True when they paid you; false (default) when you paid them. */
  received?: boolean;
  /** Called when the modal is dismissed or the settlement is recorded. */
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(() => centsToInput(Math.max(suggestedCents, 0)));
  const [methodKey, setMethodKey] = useState("venmo");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: (amountCents: number) =>
      expenseClient.recordSettlement({
        groupId,
        toUserId: other.id,
        amountCents,
        currency,
        method: methodKey,
        note,
        received,
      }),
    onSuccess: () => {
      for (const moneyKey of MONEY_KEYS) queryClient.invalidateQueries({ queryKey: moneyKey });
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const method = findPaymentMethod(methodKey);
  // Only ever the person being paid, and only when that is not you — see the
  // note on the component.
  const handle = received
    ? ""
    : (other.paymentHandles.find((entry) => entry.method === methodKey)?.handle ?? "");
  const amountCents = parseMoneyInput(amount) ?? 0;
  const link = paymentLink(methodKey, handle, amountCents, note);

  /** Copies the recipient's handle and flips the button to a confirmation. */
  const copyHandle = async () => {
    await navigator.clipboard.writeText(handle);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

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
    <Modal title={received ? "Record a payment received" : "Settle up"} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-paper p-3">
          <Avatar user={other} />
          <div className="min-w-0 text-sm">
            <p className="truncate">
              {received ? (
                <>
                  <span className="font-semibold">{other.name}</span> pays you
                </>
              ) : (
                <>
                  You pay <span className="font-semibold">{other.name}</span>
                </>
              )}
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
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(changeEvent) => setAmount(changeEvent.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5 text-lg tabular-nums focus:border-brand-500 focus:outline-none"
            />
            {suggestedCents > 0 && amountCents !== suggestedCents ? (
              <button
                type="button"
                onClick={() => setAmount(centsToInput(suggestedCents))}
                className="shrink-0 rounded-xl border border-line px-3 text-sm font-medium text-ink-soft hover:border-brand-500 hover:text-brand-700"
              >
                All of it
              </button>
            ) : null}
          </div>
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium">How</p>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((option) => {
              // Marks where this person can be paid. Meaningless when logging
              // money already received, so it is not shown then.
              const hasHandle =
                !received &&
                other.paymentHandles.some(
                  (entry) => entry.method === option.key && entry.handle,
                );
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMethodKey(option.key)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    methodKey === option.key
                      ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                      : "border-line text-ink-soft hover:border-brand-200"
                  }`}
                >
                  {option.label}
                  {/* A dot marks the apps this person can actually be paid on,
                      so the right one is obvious before anything is clicked. */}
                  {hasHandle ? (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-pos-600 align-middle" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {!received && method?.takesHandle ? (
          handle ? (
            <div className="space-y-2 rounded-xl border border-line bg-paper p-3">
              <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                {other.name.split(" ")[0]}&apos;s {method.label}
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-card px-3 py-2 font-mono text-sm">
                  {handle}
                </code>
                <button
                  type="button"
                  onClick={copyHandle}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:border-brand-500 hover:text-brand-700"
                >
                  {copied ? <Check className="h-4 w-4 text-pos-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open {method.label}
                </a>
              ) : null}
              <p className="text-xs text-ink-soft">
                {!method.linkable
                  ? `${method.label} has no shareable link — paste this into your banking app.`
                  : method.linkCarriesAmount
                    ? `Opens ${method.label} with the amount filled in. You still confirm it there.`
                    : `${method.label} can't carry an amount in a link — type it in the app.`}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft">
              {other.name.split(" ")[0]} hasn&apos;t added a {method.label} handle yet.
            </p>
          )
        ) : null}

        <input
          type="text"
          placeholder="Note (optional)"
          aria-label="Note"
          value={note}
          onChange={(changeEvent) => setNote(changeEvent.target.value)}
          className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
        />

        {error ? <p className="text-sm text-brand-600">{error}</p> : null}

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={submit}
            disabled={mutation.isPending}
            className="w-full rounded-xl bg-pos-600 py-3 font-semibold text-white transition-colors hover:bg-pos-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Recording…" : "Record payment"}
          </button>
          {/* Said plainly: this app is a ledger, not a payment processor. The
              received direction is a log of money that already arrived, so
              telling the user to "move the money first" would be nonsense. */}
          <p className="text-center text-xs text-ink-soft">
            {received ? (
              <>
                Logs money {other.name.split(" ")[0]} has already sent you — it doesn&apos;t
                request anything.
              </>
            ) : (
              <>
                This only updates the balance here — move the money in{" "}
                {method?.takesHandle ? method.label : "your app of choice"} first.
              </>
            )}
          </p>
        </div>
      </div>
    </Modal>
  );
}

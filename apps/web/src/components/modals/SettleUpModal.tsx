"use client";
/** Modal for settling up: pick which balances the payment covers and the app the money moved through, then record it. */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { copyText } from "@/lib/clipboard/copyText";
import { newOperationId } from "@/lib/operations/operationId";
import { centsToInput, formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import {
  PAYMENT_METHODS,
  displayHandle,
  findPaymentMethod,
  paymentLink,
} from "@haalkhata/shared/payment/methods";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { MAX_SETTLEMENT_NOTE_LENGTH } from "@haalkhata/shared/text/limits";

/** One balance the payment can pay down: a group's, or the pair's direct slate. */
interface OwingScope {
  /** Group id, or "" for the direct (non-group) balance. */
  scopeId: string;
  /** Name shown on the checklist row. */
  label: string;
  /** Cents outstanding in this scope in the payment's direction; always > 0. */
  owedCents: number;
  /** True when the scope simplifies debts, i.e. this amount is a rerouted edge. */
  simplified: boolean;
}

/**
 * Renders the settle-up modal: who is paying whom, which balances the payment
 * covers, the amount, which app the money moves through, and — the part that
 * actually saves time — the recipient's handle for that app, ready to copy or
 * open.
 *
 * A debt lives in exactly one scope (a group, or the pair's direct slate), so
 * the modal lists every scope where money is owed in this direction and the
 * payer picks which ones this payment addresses. Opened from the friends
 * side, everything starts checked; opened from a group, that group starts
 * checked and the rest are listed unchecked — visible, so clearing everything
 * in one go is a tap, and "settled up" can never quietly mean only one of
 * three places. The amount follows the selection until the payer types their
 * own. The server re-derives what is owed in the chosen scopes and splits the
 * recorded amount across them; the checklist is the choice, not the record.
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
  /** Suggested amount in cents; pre-fills the input until the balances load. */
  suggestedCents: number;
  /** ISO 4217 currency code of the settlement. */
  currency: string;
  /** Group whose balance starts checked; empty string starts with all checked. */
  groupId?: string;
  /** True when they paid you; false (default) when you paid them. */
  received?: boolean;
  /** Called when the modal is dismissed or the settlement is recorded. */
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // Once the payer types an amount, it outranks our arithmetic; until then
  // the shown amount is derived from the selection (see `amount` below).
  const [typedAmount, setTypedAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[] | null>(null);
  const [methodKey, setMethodKey] = useState("venmo");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // One id per attempt at recording: a retry after a lost response sends
  // the same one and gets the first recording back, never a second.
  const operationIdRef = useRef(newOperationId());

  // The same per-scope balances the friend page shows, so this checklist and
  // that page can never disagree about where money is owed.
  const ledgerQuery = useQuery({
    queryKey: queryKeys.friendLedger(other.id),
    queryFn: () => expenseClient.getFriendLedger({ userId: other.id }),
  });

  // Balances in this payment's direction only: a scope where the money points
  // the other way cannot absorb a payment, so it is not offered.
  const owingScopes: OwingScope[] = (ledgerQuery.data?.groupBalances ?? [])
    .filter((scope) => (received ? scope.netCents > 0 : scope.netCents < 0))
    .map((scope) => ({
      scopeId: scope.groupId,
      label: scope.groupId ? scope.groupName || "Unnamed group" : "Not in any group",
      owedCents: Math.abs(scope.netCents),
      simplified: scope.simplified,
    }));

  // If the named group has nothing owed in this direction (someone else just
  // settled it, or its debts got rerouted away by simplification), fall back
  // to everything rather than presenting a dead checklist.
  const defaultCheckedIds =
    groupId && owingScopes.some((scope) => scope.scopeId === groupId)
      ? [groupId]
      : owingScopes.map((scope) => scope.scopeId);
  const effectiveCheckedIds = checkedIds ?? defaultCheckedIds;
  const checkedCents = owingScopes
    .filter((scope) => effectiveCheckedIds.includes(scope.scopeId))
    .reduce((running, scope) => running + scope.owedCents, 0);

  // Derived, not synced: the amount follows the selection until the payer
  // types one, and falls back to the caller's suggestion while the balances
  // are still loading.
  const amount = amountEdited
    ? typedAmount
    : centsToInput(ledgerQuery.data ? checkedCents : Math.max(suggestedCents, 0));

  const mutation = useMutation({
    mutationFn: (amountCents: number) =>
      expenseClient.recordSettlement({
        // Scoping is the checklist's job: the server allocates the amount
        // across the selected balances and records one row in each, so every
        // ledger the pair can see moves together.
        groupId: "",
        toUserId: other.id,
        amountCents,
        currency,
        method: methodKey,
        note,
        received,
        scopeGroupIds: effectiveCheckedIds,
        operationId: operationIdRef.current,
      }),
    onSuccess: () => {
      operationIdRef.current = newOperationId();
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
  // Storage keeps the bare identifier; the payer wants the form printed on a
  // profile. "@jordan-lee" is what they will search for and what pastes
  // cleanly into the app, so it is both what is shown and what gets copied.
  const shownHandle = displayHandle(methodKey, handle);

  /** Adds or removes one balance from what this payment covers. */
  const toggleScope = (scopeId: string) => {
    setCheckedIds(
      effectiveCheckedIds.includes(scopeId)
        ? effectiveCheckedIds.filter((existing) => existing !== scopeId)
        : [...effectiveCheckedIds, scopeId],
    );
  };

  /**
   * Copies the recipient's handle and flips the button to a confirmation.
   * Only confirms on success: `navigator.clipboard` is absent outside a
   * secure context, so a phone on plain http takes the fallback path, and
   * saying "Copied" when nothing was copied is worse than saying nothing.
   */
  const copyHandle = async () => {
    if (!(await copyText(shownHandle))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  /** Validates the amount and selection, then records the settlement. */
  const submit = () => {
    const cents = parseMoneyInput(amount);
    if (cents === null || cents <= 0) {
      setError("enter a valid amount");
      return;
    }
    if (effectiveCheckedIds.length === 0) {
      setError("pick at least one balance to settle");
      return;
    }
    if (cents > checkedCents) {
      setError(
        `that's more than the ${formatMoney(checkedCents, currency)} outstanding in the selected balances`,
      );
      return;
    }
    mutation.mutate(cents);
  };

  const settledUp = ledgerQuery.data !== undefined && owingScopes.length === 0;

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
          </div>
        </div>

        {/* Which balances the payment covers. Listed in full even when opened
            from one group — the other places money is owed stay visible, so
            bundling them is one tap and partial settling is a choice made
            here, not an accident discovered later. */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {received ? "What this payment clears" : "What this payment pays down"}
          </p>
          {ledgerQuery.data === undefined ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft">
              Loading balances…
            </p>
          ) : settledUp ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft">
              {received
                ? `${other.name.split(" ")[0]} doesn't owe you anything right now.`
                : `You don't owe ${other.name.split(" ")[0]} anything right now.`}
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
              {owingScopes.map((scope) => (
                <li key={scope.scopeId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={effectiveCheckedIds.includes(scope.scopeId)}
                      onChange={() => toggleScope(scope.scopeId)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {scope.label}
                      {/* The amount here is the group's rerouted edge, not your
                          direct history with this person — worth a word, since
                          it can differ from what you remember sharing. */}
                      {scope.simplified ? (
                        <span className="ml-1.5 rounded-full bg-card px-2 py-0.5 text-[11px] text-ink-soft">
                          simplified
                        </span>
                      ) : null}
                    </span>
                    <Money cents={scope.owedCents} currency={currency} className="font-medium" />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="block text-sm font-medium">
          Amount ({currency})
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(changeEvent) => {
                setTypedAmount(changeEvent.target.value);
                setAmountEdited(true);
              }}
              className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5 text-lg tabular-nums focus:border-brand-500 focus:outline-none"
            />
            {checkedCents > 0 && amountCents !== checkedCents ? (
              <button
                type="button"
                onClick={() => setAmountEdited(false)}
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
                  {shownHandle}
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
          maxLength={MAX_SETTLEMENT_NOTE_LENGTH}
          value={note}
          onChange={(changeEvent) => setNote(changeEvent.target.value)}
          className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
        />

        {error ? <p className="text-sm text-brand-600">{error}</p> : null}

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={submit}
            disabled={mutation.isPending || ledgerQuery.data === undefined || settledUp}
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

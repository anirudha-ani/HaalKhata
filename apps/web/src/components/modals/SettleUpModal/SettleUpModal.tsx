"use client";
/** Modal for settling up: shows exactly which balances a payment settles, takes the amount and the app the money moved through, then records it. */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { copyText } from "@/lib/clipboard/copyText";
import { newOperationId } from "@/lib/operations/operationId";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import {
  PAYMENT_METHODS,
  displayHandle,
  findPaymentMethod,
  paymentLink,
} from "@haalkhata/shared/payment/methods";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { Modal } from "@/components/ui/Modal/Modal";
import { Money } from "@/components/ui/Money/Money";
import { MAX_SETTLEMENT_NOTE_LENGTH } from "@haalkhata/shared/text/limits";
import {
  readSettlePositions,
  settleOverLimitMessage,
} from "@haalkhata/shared/expense/settlePosition";

/**
 * Renders the settle-up modal: who is paying whom, exactly which balances
 * the payment settles, the amount, which app the money moves through, and —
 * the part that actually saves time — the recipient's handle for that app,
 * ready to copy or open.
 *
 * What it settles follows from where it was opened, and there is nothing to
 * pick inside it:
 *
 * - Opened beside a total — a person on Home or Friends, the headline on
 *   their page — it settles everything with that person in the currency.
 *   Every balance behind the total is listed, both ways, with the one amount
 *   that changes hands: what is owed outside groups counted together with
 *   what is owed inside them. The server cancels balances that point the
 *   other way against the rest in the same transaction, so one payment
 *   leaves all of them settled.
 * - Opened beside one balance — a group's page, or a single row of where a
 *   balance sits — it settles that balance and nothing else, whatever else
 *   the pair owes each other.
 *
 * The balances are not worked out here. The server computes the pair's
 * position with the code that records the settlement and sends it with a
 * fingerprint; the modal shows it, and when settling everything sends the
 * fingerprint back, so the server refuses if the ledger has moved since.
 * What gets settled is what was on screen. The direction is whichever way
 * the listed balances point, so it follows the currency.
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
 *
 * A payment moves in one currency and settles balances in that currency
 * only — nothing converts. When there is something to settle in more than
 * one, the modal offers a switch; the list, the amount and the request all
 * follow it.
 */
export function SettleUpModal({
  to: other,
  suggestedCents,
  currency: initialCurrency,
  scopeId,
  received: receivedHint = false,
  onClose,
}: {
  /** The other person, whichever way the money moved. */
  to: User;
  /** Suggested amount in cents; pre-fills the input until the balances load. */
  suggestedCents: number;
  /** ISO 4217 code to start on; the modal can switch to another with something to settle. */
  currency: string;
  /**
   * The one balance to settle: a group's id, or "" for what is not in any
   * group. Omitted, the modal settles everything with the person.
   */
  scopeId?: string;
  /**
   * True when they paid you; false (default) when you paid them. It only
   * says what to show while the balances load: the direction is then the way
   * the balances being settled point.
   */
  received?: boolean;
  /** Called when the modal is dismissed or the settlement is recorded. */
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // Once the payer types an amount, it outranks our arithmetic; until then
  // the shown amount is what is being settled (see `amount` below).
  const [typedAmount, setTypedAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [chosenCurrency, setChosenCurrency] = useState(initialCurrency);
  const [methodKey, setMethodKey] = useState("venmo");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // One id per attempt at recording: a retry after a lost response sends
  // the same one and gets the first recording back, never a second.
  const operationIdRef = useRef(newOperationId());

  // The pair's position, computed by the code that records settlements, so
  // this modal and the write it sends can never disagree about what is owed.
  const ledgerQuery = useQuery({
    queryKey: queryKeys.friendLedger(other.id),
    queryFn: () => expenseClient.getFriendLedger({ userId: other.id }),
  });
  const loaded = ledgerQuery.data !== undefined;
  const positions = ledgerQuery.data?.settlePositions ?? [];

  // Stay on a currency that has something to settle: if the one this opened
  // on has nothing (it was just settled elsewhere), move to one that does
  // instead of presenting an empty form.
  const { currencies } = readSettlePositions(positions, chosenCurrency, scopeId);
  const currency = currencies.includes(chosenCurrency)
    ? chosenCurrency
    : (currencies[0] ?? chosenCurrency);
  const reading = readSettlePositions(positions, currency, scopeId);
  const payableCents = Math.abs(reading.netCents);
  const received = reading.netCents !== 0 ? reading.netCents > 0 : receivedHint;
  const firstName = other.name.split(" ")[0];

  // Derived, not synced: the amount is what is being settled until the payer
  // types one, and falls back to the caller's suggestion while the balances
  // are still loading.
  const amount = amountEdited
    ? typedAmount
    : centsToInput(loaded ? payableCents : Math.max(suggestedCents, 0), currency);

  const mutation = useMutation({
    mutationFn: (amountCents: number) =>
      expenseClient.recordSettlement({
        groupId: "",
        toUserId: other.id,
        amountCents,
        currency,
        method: methodKey,
        note,
        received,
        // One balance: the server records the payment in that scope alone.
        // Everything: it names none, and the server settles the pair's net,
        // cancelling whatever points the other way.
        scopeGroupIds: reading.everything ? [] : [scopeId ?? ""],
        netAcrossScopes: reading.everything,
        // What was on screen; the server refuses if it no longer holds.
        positionDigest: reading.digest,
        operationId: operationIdRef.current,
      }),
    onSuccess: () => {
      operationIdRef.current = newOperationId();
      for (const moneyKey of MONEY_KEYS) queryClient.invalidateQueries({ queryKey: moneyKey });
      onClose();
    },
    onError: (mutationError) => {
      setError(errorMessage(mutationError));
      // A refusal usually means the balances are not what this dialog is
      // showing any more; reload them so the next attempt is against the
      // real ones, and so the person can see what changed.
      queryClient.invalidateQueries({ queryKey: queryKeys.friendLedger(other.id) });
    },
  });

  const method = findPaymentMethod(methodKey);
  // Only ever the person being paid, and only when that is not you — see the
  // note on the component.
  const handle = received
    ? ""
    : (other.paymentHandles.find((entry) => entry.method === methodKey)?.handle ?? "");
  const amountCents = parseMoneyInput(amount, currency) ?? 0;
  const link = paymentLink(methodKey, handle, amountCents, note);
  // Storage keeps the bare identifier; the payer wants the form printed on a
  // profile. "@jordan-lee" is what they will search for and what pastes
  // cleanly into the app, so it is both what is shown and what gets copied.
  const shownHandle = displayHandle(methodKey, handle);

  /**
   * Switches the payment's currency: the list, the amount and the request
   * all follow, and any typed amount is dropped since it was in the old
   * currency.
   *
   * @param nextCurrency - ISO 4217 code to pay in.
   */
  const switchCurrency = (nextCurrency: string) => {
    setChosenCurrency(nextCurrency);
    setAmountEdited(false);
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

  /** Validates the amount against what is being settled, then records the settlement. */
  const submit = () => {
    const cents = parseMoneyInput(amount, currency);
    if (cents === null || cents <= 0) {
      setError("enter a valid amount");
      return;
    }
    if (cents > payableCents) {
      setError(settleOverLimitMessage(reading, currency, firstName));
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
          </div>
        </div>

        {/* Currencies are separate ledgers: a payment is in one, and only
            that one's balances are settled. The switch appears only when
            there is something to settle in more than one. */}
        {currencies.length > 1 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Currency</p>
            <div className="flex flex-wrap gap-1.5">
              {currencies.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={currency === code}
                  onClick={() => switchCurrency(code)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    currency === code
                      ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                      : "border-line text-ink-soft hover:border-brand-200"
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Exactly what this payment settles: every balance with the person
            when it was opened beside a total, the one balance when it was
            opened beside that. Nothing to tick. */}
        <div className="space-y-2">
          <p className="text-sm font-medium">What this settles</p>
          {!loaded ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft">
              Loading balances…
            </p>
          ) : reading.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft">
              {reading.everything
                ? `Nothing to settle with ${firstName} right now.`
                : `Nothing is owed between you and ${firstName} here right now.`}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
                {reading.rows.map((scope) => (
                  <li key={scope.scopeId} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {scope.label}
                      {/* The amount is the group's rerouted edge, not your
                          direct history with this person — worth a word, since
                          it can differ from what you remember sharing. */}
                      {scope.simplified ? (
                        <span className="ml-1.5 rounded-full bg-card px-2 py-0.5 text-[11px] text-ink-soft">
                          simplified
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {scope.netCents > 0 ? "owes you" : "you owe"}
                    </span>
                    <Money
                      cents={Math.abs(scope.netCents)}
                      currency={currency}
                      className={`w-20 text-right font-medium ${
                        scope.netCents > 0 ? "text-pos-700" : "text-neg-600"
                      }`}
                    />
                  </li>
                ))}
                {/* Several balances add up to one amount that changes hands;
                    a single balance is already that amount. */}
                {reading.rows.length > 1 ? (
                  <li className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold">
                    <span className="min-w-0 flex-1 truncate">
                      {received ? `${firstName} pays you` : `You pay ${firstName}`}
                    </span>
                    <Money cents={payableCents} currency={currency} className="w-20 text-right" />
                  </li>
                ) : null}
              </ul>
              {reading.rows.length > 1 ? (
                <p className="text-xs text-ink-soft">One payment settles all of these.</p>
              ) : null}
            </>
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
            {payableCents > 0 && amountCents !== payableCents ? (
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
                {firstName}&apos;s {method.label}
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
              {firstName} hasn&apos;t added a {method.label} handle yet.
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
            disabled={mutation.isPending || !loaded || reading.rows.length === 0}
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
                Logs money {firstName} has already sent you — it doesn&apos;t
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

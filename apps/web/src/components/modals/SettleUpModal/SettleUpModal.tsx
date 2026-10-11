"use client";
/** Modal for settling up: shows exactly which balances a payment settles, takes the amount and how the money moved, shows where to send it, then records it. */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { newOperationId } from "@/lib/operations/operationId";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { CASH_CHOICE } from "@haalkhata/shared/payment/payeeMethods";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { Modal } from "@/components/ui/Modal/Modal";
import { Money } from "@/components/ui/Money/Money";
import { MAX_SETTLEMENT_NOTE_LENGTH } from "@haalkhata/shared/text/limits";
import {
  readSettlePositions,
  settleOverLimitMessage,
} from "@haalkhata/shared/expense/settlePosition";
import { PayMethodChips } from "./components/PayMethodChips/PayMethodChips";
import { PayeeMethodDetails } from "./components/PayeeMethodDetails/PayeeMethodDetails";
import { usePayMethods } from "./hooks/usePayMethods";

/**
 * Renders the settle-up modal: who is paying whom, exactly which balances
 * the payment settles, the amount, how the money moves, and — the part that
 * actually saves time — the recipient's own payment methods for the
 * currency being paid, their preferred one already selected, every detail
 * ready to copy.
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
 * It never moves money. It records that a payment happened, which is stated
 * on the button's own line rather than left to be discovered.
 *
 * Whose methods "How" lists follows the direction. Paying someone, they are
 * that person's, and the selected one's details are shown. They arrive on
 * the friend ledger, which sends them only to someone who owes that person.
 * Recording a payment received, they are your own, to note how the money
 * arrived, and no details are shown: there is nobody to send anything to.
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
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
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
  const payMethods = usePayMethods({
    payeeMethods: ledgerQuery.data?.payeeMethods ?? [],
    currency,
    received,
  });

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
        method: payMethods.settlementKey,
        // The server keeps the method's name with the payment, so the
        // history can say how the money moved.
        paymentMethodId: payMethods.method?.id ?? "",
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

  const amountCents = parseMoneyInput(amount, currency) ?? 0;
  // Said only when there is a payment to make: with nothing owed the
  // methods are not sent at all, and "has not added one" would be untrue.
  const canPay = loaded && !received && reading.rows.length > 0;

  /**
   * Switches the payment's currency: the list, the amount, the methods
   * offered and the request all follow. A typed amount is dropped since it
   * was in the old currency, and so is a picked method, so the selection
   * goes back to that currency's preferred one.
   *
   * @param nextCurrency - ISO 4217 code to pay in.
   */
  const switchCurrency = (nextCurrency: string) => {
    setChosenCurrency(nextCurrency);
    setAmountEdited(false);
    payMethods.resetPick();
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
          <PayMethodChips
            usable={payMethods.usable}
            others={payMethods.others}
            choice={payMethods.choice}
            onPick={payMethods.pick}
          />
          {/* Why the list is short, said by name and currency, so nobody
              takes "no bKash here" for "the app does not do bKash". */}
          {canPay && payMethods.usable.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft">
              {payMethods.hasAnyMethod
                ? `${firstName} has not added a way to be paid in ${currency}.`
                : `${firstName} has not added a way to be paid yet.`}
            </p>
          ) : null}
        </div>

        {!received && payMethods.method ? (
          <PayeeMethodDetails
            // A different method is a different card: its "Copied" marks reset.
            key={payMethods.method.id}
            method={payMethods.method}
            firstName={firstName}
            amountCents={amountCents}
            currency={currency}
            note={note}
          />
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
                Logs money {firstName} has already sent you. It doesn&apos;t request anything.
              </>
            ) : payMethods.choice === CASH_CHOICE ? (
              <>This only updates the balance here. Hand over the cash first.</>
            ) : (
              <>
                This only updates the balance here. Move the money in{" "}
                {payMethods.method?.name ?? "your app of choice"} first.
              </>
            )}
          </p>
        </div>
      </div>
    </Modal>
  );
}

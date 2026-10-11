/** Bottom sheet for settling up: shows exactly which balances a payment settles, takes the amount and how the money moved, shows where to send it, then records it. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { newOperationId } from "@/lib/api/operationId";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import { ownMethodsFailedLine } from "@haalkhata/shared/payment/copy";
import { CASH_CHOICE } from "@haalkhata/shared/payment/payeeMethods";
import { MAX_SETTLEMENT_NOTE_LENGTH } from "@haalkhata/shared/text/limits";
import {
  readSettlePositions,
  settleOverLimitMessage,
} from "@haalkhata/shared/expense/settlePosition";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { usePayMethods } from "./hooks/usePayMethods";
import { PayeeMethodDetails } from "./PayeeMethodDetails";
import { PayMethodChips } from "./PayMethodChips";

/**
 * Renders the settle-up sheet: who is paying whom, exactly which balances
 * the payment settles, the amount, how the money moves, and — the part that
 * actually saves time — the recipient's own payment methods for the
 * currency being paid, their preferred one already selected, every detail
 * ready to copy.
 *
 * What it settles follows from where it was opened, and there is nothing to
 * pick inside it:
 *
 * - Opened beside a total — a person on Home or Friends, the headline on
 *   their screen — it settles everything with that person in the currency.
 *   Every balance behind the total is listed, both ways, with the one amount
 *   that changes hands: what is owed outside groups counted together with
 *   what is owed inside them. The server cancels balances that point the
 *   other way against the rest in the same transaction, so one payment
 *   leaves all of them settled.
 * - Opened beside one balance — a group's screen, or a single row of where a
 *   balance sits — it settles that balance and nothing else, whatever else
 *   the pair owes each other.
 *
 * The balances are not worked out here. The server computes the pair's
 * position with the code that records the settlement and sends it with a
 * fingerprint; the sheet shows it, and when settling everything sends the
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
 * one, the sheet offers a switch; the list, the amount and the request all
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
  /** ISO 4217 code to start on; the sheet can switch to another with something to settle. */
  currency: string;
  /**
   * The one balance to settle: a group's id, or "" for what is not in any
   * group. Omitted, the sheet settles everything with the person.
   */
  scopeId?: string;
  /**
   * True when they paid you; false (default) when you paid them. It only
   * says what to show while the balances load: the direction is then the way
   * the balances being settled point.
   */
  received?: boolean;
  /** Called when the sheet is dismissed or the settlement is recorded. */
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
  // this sheet and the write it sends can never disagree about what is owed.
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
      // A refusal usually means the balances are not what this sheet is
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
    <Sheet onClose={onClose} title={received ? "Record a payment received" : "Settle up"}>
      <View style={styles.body}>
        <View style={styles.recipientCard}>
          <Avatar user={other} />
          <Text numberOfLines={1} style={styles.recipientLine}>
            {received ? (
              <>
                <Text style={styles.recipientName}>{other.name}</Text> pays you
              </>
            ) : (
              <>
                You pay <Text style={styles.recipientName}>{other.name}</Text>
              </>
            )}
          </Text>
        </View>

        {/* Currencies are separate ledgers: a payment is in one, and only
            that one's balances are settled. The switch appears only when
            there is something to settle in more than one. */}
        {currencies.length > 1 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Currency</Text>
            <View style={styles.methods}>
              {currencies.map((code) => (
                <Chip
                  key={code}
                  label={code}
                  onPress={() => switchCurrency(code)}
                  selected={currency === code}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Exactly what this payment settles: every balance with the person
            when it was opened beside a total, the one balance when it was
            opened beside that. Nothing to tick. */}
        <View style={styles.block}>
          <Text style={styles.blockTitle}>What this settles</Text>
          {!loaded && ledgerQuery.isError ? (
            // Said here, with a way to try again: "Loading balances…" under
            // a read that has already failed would never change.
            <View accessibilityRole="alert" style={styles.failed}>
              <Text style={styles.error}>
                Balances could not be loaded: {errorMessage(ledgerQuery.error)}
              </Text>
              <Button
                compact
                label="Try again"
                onPress={() => void ledgerQuery.refetch()}
                variant="outline"
              />
            </View>
          ) : !loaded ? (
            <Text style={styles.placeholder}>Loading balances…</Text>
          ) : reading.rows.length === 0 ? (
            <Text style={styles.placeholder}>
              {reading.everything
                ? `Nothing to settle with ${firstName} right now.`
                : `Nothing is owed between you and ${firstName} here right now.`}
            </Text>
          ) : (
            <>
              <View style={styles.scopeList}>
                {reading.rows.map((scope, index) => (
                  <View
                    key={scope.scopeId || "one-off"}
                    style={[styles.scopeRow, index > 0 ? styles.scopeRowDivider : null]}
                  >
                    <Text numberOfLines={1} style={styles.scopeLabel}>
                      {scope.label}
                    </Text>
                    {/* The amount is the group's rerouted edge, not your
                        direct history with this person — worth a word, since
                        it can differ from what you remember sharing. */}
                    {scope.simplified ? (
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>simplified</Text>
                      </View>
                    ) : null}
                    <Text style={styles.scopeDirection}>
                      {scope.netCents > 0 ? "owes you" : "you owe"}
                    </Text>
                    <Money
                      cents={Math.abs(scope.netCents)}
                      currency={currency}
                      style={[
                        styles.scopeAmount,
                        scope.netCents > 0 ? styles.scopeOwedToYou : styles.scopeOwedByYou,
                      ]}
                    />
                  </View>
                ))}
                {/* Several balances add up to one amount that changes hands;
                    a single balance is already that amount. */}
                {reading.rows.length > 1 ? (
                  <View style={[styles.scopeRow, styles.scopeRowDivider]}>
                    <Text numberOfLines={1} style={[styles.scopeLabel, styles.scopeNet]}>
                      {received ? `${firstName} pays you` : `You pay ${firstName}`}
                    </Text>
                    <Money
                      cents={payableCents}
                      currency={currency}
                      style={[styles.scopeAmount, styles.scopeNet]}
                    />
                  </View>
                ) : null}
              </View>
              {reading.rows.length > 1 ? (
                <Text style={styles.scopeHint}>One payment settles all of these.</Text>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.amountRow}>
          <View style={styles.amountField}>
            <TextField
              keyboardType="decimal-pad"
              label={`Amount (${currency})`}
              onChangeText={(text) => {
                setTypedAmount(text);
                setAmountEdited(true);
              }}
              value={amount}
            />
          </View>
          {payableCents > 0 && amountCents !== payableCents ? (
            <View style={styles.amountAction}>
              <Button
                compact
                label="All of it"
                onPress={() => setAmountEdited(false)}
                variant="outline"
              />
            </View>
          ) : null}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>How</Text>
          <PayMethodChips
            choice={payMethods.choice}
            onPick={payMethods.pick}
            others={payMethods.others}
            usable={payMethods.usable}
          />
          {payMethods.ownMethodsError ? (
            <View accessibilityRole="alert" style={styles.failed}>
              <Text style={styles.error}>{ownMethodsFailedLine(payMethods.ownMethodsError)}</Text>
              <Button
                compact
                label="Try again"
                onPress={payMethods.retryOwnMethods}
                variant="outline"
              />
            </View>
          ) : null}
          {/* Why the list is short, said by name and currency, so nobody
              takes "no bKash here" for "the app does not do bKash". */}
          {canPay && payMethods.usable.length === 0 ? (
            <Text style={styles.placeholder}>
              {payMethods.hasAnyMethod
                ? `${firstName} has not added a way to be paid in ${currency}.`
                : `${firstName} has not added a way to be paid yet.`}
            </Text>
          ) : null}
        </View>

        {!received && payMethods.method ? (
          <PayeeMethodDetails
            amountCents={amountCents}
            currency={currency}
            firstName={firstName}
            // A different method is a different card: its "Copied" marks reset.
            key={payMethods.method.id}
            method={payMethods.method}
            note={note}
          />
        ) : null}

        <TextField
          maxLength={MAX_SETTLEMENT_NOTE_LENGTH}
          onChangeText={setNote}
          placeholder="Note (optional)"
          value={note}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.submitBlock}>
          <Button
            busy={mutation.isPending}
            disabled={!loaded || reading.rows.length === 0}
            label="Record payment"
            onPress={submit}
            variant="positive"
          />
          {/* Said plainly: this app is a ledger, not a payment processor. The
              received direction is a log of money that already arrived, so
              telling the user to "move the money first" would be nonsense. */}
          <Text style={styles.submitHint}>
            {received
              ? `Logs money ${firstName} has already sent you. It doesn't request anything.`
              : payMethods.choice === CASH_CHOICE
                ? "This only updates the balance here. Hand over the cash first."
                : `This only updates the balance here. Move the money in ${
                    payMethods.method?.name ?? "your app of choice"
                  } first.`}
          </Text>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  amountAction: {
    justifyContent: "flex-end",
    paddingBottom: 6,
  },
  amountField: {
    flex: 1,
  },
  amountRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  block: {
    gap: spacing.sm,
  },
  blockTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  body: {
    gap: spacing.lg,
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
  },
  failed: {
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  methods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pill: {
    backgroundColor: colors.card,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillText: {
    color: colors.inkSoft,
    fontSize: 11,
  },
  placeholder: {
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "dashed",
    borderWidth: 1,
    color: colors.inkSoft,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  recipientCard: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  recipientLine: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
  },
  recipientName: {
    fontWeight: "600",
  },
  scopeAmount: {
    fontSize: 14,
    fontWeight: "500",
  },
  scopeDirection: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  scopeHint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  scopeLabel: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
  },
  scopeNet: {
    fontWeight: "600",
  },
  scopeOwedByYou: {
    color: colors.neg600,
  },
  scopeOwedToYou: {
    color: colors.pos700,
  },
  scopeList: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  scopeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  scopeRowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  submitBlock: {
    gap: spacing.xs + 2,
  },
  submitHint: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});

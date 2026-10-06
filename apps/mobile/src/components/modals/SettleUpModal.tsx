/** Bottom sheet for settling up: shows exactly which balances a payment settles, takes the amount and the app the money moved through, then records it. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, ExternalLink } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
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
import {
  PAYMENT_METHODS,
  displayHandle,
  findPaymentMethod,
  paymentLink,
} from "@haalkhata/shared/payment/methods";
import { MAX_SETTLEMENT_NOTE_LENGTH } from "@haalkhata/shared/text/limits";
import {
  readSettlePositions,
  settleOverLimitMessage,
} from "@haalkhata/shared/expense/settlePosition";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { COPIED_BADGE_MS } from "./modals.constants";

/**
 * Renders the settle-up sheet: who is paying whom, exactly which balances
 * the payment settles, the amount, which app the money moves through, and —
 * the part that actually saves time — the recipient's handle for that app,
 * ready to copy or open.
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
 * that opens Venmo to pay yourself.
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
  const [methodKey, setMethodKey] = useState("venmo");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
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
      // A refusal usually means the balances are not what this sheet is
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
  // The "Copied" confirmation clears itself.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_BADGE_MS);
    return () => clearTimeout(timer);
  }, [copied]);

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

  /** Copies the recipient's handle and flips the button to a confirmation. */
  const copyHandle = async () => {
    if (shownHandle === "") return;
    try {
      await Clipboard.setStringAsync(shownHandle);
      setCopied(true);
    } catch {
      // Nothing was copied; saying "Copied" would be worse than saying nothing.
    }
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
          {!loaded ? (
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
          <View style={styles.methods}>
            {PAYMENT_METHODS.map((methodOption) => {
              // Marks where this person can be paid. Meaningless when logging
              // money already received, so it is not shown then.
              const hasHandle =
                !received &&
                other.paymentHandles.some(
                  (entry) => entry.method === methodOption.key && entry.handle,
                );
              return (
                <Chip
                  icon={hasHandle ? <View style={styles.handleDot} /> : undefined}
                  key={methodOption.key}
                  label={methodOption.label}
                  onPress={() => setMethodKey(methodOption.key)}
                  selected={methodKey === methodOption.key}
                />
              );
            })}
          </View>
        </View>

        {!received && method?.takesHandle ? (
          handle ? (
            <View style={styles.handleCard}>
              <Text style={styles.handleTitle}>
                {firstName.toUpperCase()}&apos;S {method.label.toUpperCase()}
              </Text>
              <View style={styles.handleRow}>
                <Text numberOfLines={1} selectable style={styles.handleText}>
                  {shownHandle}
                </Text>
                <Button
                  compact
                  icon={
                    copied ? (
                      <Check color={colors.pos600} size={14} />
                    ) : (
                      <Copy color={colors.inkSoft} size={14} />
                    )
                  }
                  label={copied ? "Copied" : "Copy"}
                  onPress={() => void copyHandle()}
                  variant="outline"
                />
              </View>
              {link ? (
                <Button
                  icon={<ExternalLink color={colors.white} size={16} />}
                  label={`Open ${method.label}`}
                  onPress={() => void Linking.openURL(link)}
                />
              ) : null}
              <Text style={styles.handleHint}>
                {!method.linkable
                  ? `${method.label} has no shareable link — paste this into your banking app.`
                  : method.linkCarriesAmount
                    ? `Opens ${method.label} with the amount filled in. You still confirm it there.`
                    : `${method.label} can't carry an amount in a link — type it in the app.`}
              </Text>
            </View>
          ) : (
            <Text style={styles.placeholder}>
              {firstName} hasn&apos;t added a {method.label} handle yet.
            </Text>
          )
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
              ? `Logs money ${firstName} has already sent you — it doesn't request anything.`
              : `This only updates the balance here — move the money in ${
                  method?.takesHandle ? method.label : "your app of choice"
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
  handleCard: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  handleDot: {
    backgroundColor: colors.pos600,
    borderRadius: radii.full,
    height: 6,
    width: 6,
  },
  handleHint: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  handleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  handleText: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    color: colors.ink,
    flex: 1,
    fontFamily: "monospace",
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  handleTitle: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
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

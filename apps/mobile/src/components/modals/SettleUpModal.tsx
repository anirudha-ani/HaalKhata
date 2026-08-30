/** Bottom sheet for settling up: pick which balances the payment covers and the app the money moved through, then record it. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, ExternalLink } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { newOperationId } from "@/lib/api/operationId";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { centsToInput, formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import {
  PAYMENT_METHODS,
  displayHandle,
  findPaymentMethod,
  paymentLink,
} from "@haalkhata/shared/payment/methods";
import { MAX_SETTLEMENT_NOTE_LENGTH } from "@haalkhata/shared/text/limits";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { COPIED_BADGE_MS } from "./modals.constants";

/** One balance the payment can pay down: a group's, or the pair's direct slate, in one currency. */
interface OwingScope {
  /** Group id, or "" for the direct (non-group) balance. */
  scopeId: string;
  /** ISO 4217 code the balance is denominated in. */
  currency: string;
  /** Name shown on the checklist row. */
  label: string;
  /** Cents outstanding in this scope in the payment's direction; always > 0. */
  owedCents: number;
  /** True when the scope simplifies debts, i.e. this amount is a rerouted edge. */
  simplified: boolean;
}

/**
 * Renders the settle-up sheet: who is paying whom, which balances the payment
 * covers, the amount, which app the money moves through, and — the part that
 * actually saves time — the recipient's handle for that app, ready to copy or
 * open.
 *
 * A debt lives in exactly one scope (a group, or the pair's direct slate), so
 * the sheet lists every scope where money is owed in this direction and the
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
 * that opens Venmo to pay yourself.
 *
 * A payment moves in one currency and pays down balances in that currency
 * only — nothing converts. When the pair owes in more than one, the sheet
 * offers a switch; the checklist, the amount and the request all follow it.
 */
export function SettleUpModal({
  to: other,
  suggestedCents,
  currency: initialCurrency,
  groupId = "",
  received = false,
  onClose,
}: {
  /** The other person, whichever way the money moved. */
  to: User;
  /** Suggested amount in cents; pre-fills the input until the balances load. */
  suggestedCents: number;
  /** ISO 4217 code to start on; the sheet can switch to another the pair owes in. */
  currency: string;
  /** Group whose balance starts checked; empty string starts with all checked. */
  groupId?: string;
  /** True when they paid you; false (default) when you paid them. */
  received?: boolean;
  /** Called when the sheet is dismissed or the settlement is recorded. */
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // Once the payer types an amount, it outranks our arithmetic; until then
  // the shown amount is derived from the selection (see `amount` below).
  const [typedAmount, setTypedAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[] | null>(null);
  const [currency, setCurrency] = useState(initialCurrency);
  const [methodKey, setMethodKey] = useState("venmo");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // One id per attempt at recording: a retry after a lost response sends
  // the same one and gets the first recording back, never a second.
  const operationIdRef = useRef(newOperationId());

  // The same per-scope balances the friend screen shows, so this checklist
  // and that screen can never disagree about where money is owed.
  const ledgerQuery = useQuery({
    queryKey: queryKeys.friendLedger(other.id),
    queryFn: () => expenseClient.getFriendLedger({ userId: other.id }),
  });

  // Balances in this payment's direction only: a scope where the money points
  // the other way cannot absorb a payment, so it is not offered.
  const owingAnywhere: OwingScope[] = (ledgerQuery.data?.groupBalances ?? [])
    .filter((scope) => (received ? scope.netCents > 0 : scope.netCents < 0))
    .map((scope) => ({
      scopeId: scope.groupId,
      currency: scope.currency || initialCurrency,
      label: scope.groupId ? scope.groupName || "Unnamed group" : "Not in any group",
      owedCents: Math.abs(scope.netCents),
      simplified: scope.simplified,
    }));
  // The currencies this direction owes in, for the switch; and only the
  // chosen currency's balances are listed — a dollar cannot pay down a euro.
  const owedCurrencies = [...new Set(owingAnywhere.map((scope) => scope.currency))].sort();
  const owingScopes = owingAnywhere.filter((scope) => scope.currency === currency);

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
  const firstName = other.name.split(" ")[0];

  // The "Copied" confirmation clears itself.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_BADGE_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  /**
   * Switches the payment's currency: the checklist, the amount and the
   * request all follow, and any typed amount is dropped since it was in
   * the old currency.
   *
   * @param nextCurrency - ISO 4217 code to pay in.
   */
  const switchCurrency = (nextCurrency: string) => {
    setCurrency(nextCurrency);
    setCheckedIds(null);
    setAmountEdited(false);
  };

  /** Adds or removes one balance from what this payment covers. */
  const toggleScope = (scopeId: string) => {
    setCheckedIds(
      effectiveCheckedIds.includes(scopeId)
        ? effectiveCheckedIds.filter((existing) => existing !== scopeId)
        : [...effectiveCheckedIds, scopeId],
    );
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

  const settledUp = ledgerQuery.data !== undefined && owingAnywhere.length === 0;

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
            that one's balances are offered. The switch appears only when the
            pair owes in more than one. */}
        {owedCurrencies.length > 1 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Currency</Text>
            <View style={styles.methods}>
              {owedCurrencies.map((code) => (
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

        {/* Which balances the payment covers. Listed in full even when opened
            from one group — the other places money is owed stay visible, so
            bundling them is one tap and partial settling is a choice made
            here, not an accident discovered later. */}
        <View style={styles.block}>
          <Text style={styles.blockTitle}>
            {received ? "What this payment clears" : "What this payment pays down"}
          </Text>
          {ledgerQuery.data === undefined ? (
            <Text style={styles.placeholder}>Loading balances…</Text>
          ) : settledUp ? (
            <Text style={styles.placeholder}>
              {received
                ? `${firstName} doesn't owe you anything right now.`
                : `You don't owe ${firstName} anything right now.`}
            </Text>
          ) : owingScopes.length === 0 ? (
            <Text style={styles.placeholder}>
              Nothing outstanding in {currency} — pick another currency above.
            </Text>
          ) : (
            <View style={styles.scopeList}>
              {owingScopes.map((scope, index) => {
                const isChecked = effectiveCheckedIds.includes(scope.scopeId);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    key={scope.scopeId || "one-off"}
                    onPress={() => toggleScope(scope.scopeId)}
                    style={[styles.scopeRow, index > 0 ? styles.scopeRowDivider : null]}
                  >
                    <View style={[styles.checkbox, isChecked ? styles.checkboxChecked : null]}>
                      {isChecked ? <Check color={colors.white} size={12} /> : null}
                    </View>
                    <Text numberOfLines={1} style={styles.scopeLabel}>
                      {scope.label}
                    </Text>
                    {/* The amount here is the group's rerouted edge, not your
                        direct history with this person — worth a word, since
                        it can differ from what you remember sharing. */}
                    {scope.simplified ? (
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>simplified</Text>
                      </View>
                    ) : null}
                    <Money cents={scope.owedCents} currency={currency} style={styles.scopeAmount} />
                  </Pressable>
                );
              })}
            </View>
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
          {checkedCents > 0 && amountCents !== checkedCents ? (
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
            disabled={ledgerQuery.data === undefined || settledUp || owingScopes.length === 0}
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
  checkbox: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 5,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  checkboxChecked: {
    backgroundColor: colors.brand600,
    borderColor: colors.brand600,
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
  scopeLabel: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
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

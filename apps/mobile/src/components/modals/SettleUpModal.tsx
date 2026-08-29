/** Bottom sheet for recording a settlement payment to another user. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { MONEY_KEYS } from "@haalkhata/shared/api/queryKeys";
import { centsToInput, formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { PAYMENT_METHODS } from "@haalkhata/shared/payment/methods";
import { MAX_SETTLEMENT_NOTE_LENGTH } from "@haalkhata/shared/text/limits";

/**
 * Renders a sheet for recording a settlement payment: the signed-in user pays
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
  /** Called when the sheet is dismissed or the settlement is recorded. */
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
    <Sheet onClose={onClose} title="Settle up">
      <View style={styles.body}>
        <View style={styles.recipientCard}>
          <Avatar user={recipient} />
          <View>
            <Text style={styles.recipientLine}>
              You pay <Text style={styles.recipientName}>{recipient.name}</Text>
            </Text>
            {suggestedCents > 0 ? (
              <Text style={styles.outstanding}>
                outstanding: {formatMoney(suggestedCents, currency)}
              </Text>
            ) : null}
          </View>
        </View>

        <TextField
          keyboardType="decimal-pad"
          label={`Amount (${currency})`}
          onChangeText={setAmount}
          value={amount}
        />

        <View style={styles.methods}>
          {PAYMENT_METHODS.map((methodOption) => (
            <Chip
              key={methodOption.key}
              label={methodOption.label}
              onPress={() => setMethod(methodOption.key)}
              selected={method === methodOption.key}
            />
          ))}
        </View>

        <TextField
          maxLength={MAX_SETTLEMENT_NOTE_LENGTH}
          onChangeText={setNote}
          placeholder="Note (optional)"
          value={note}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          busy={mutation.isPending}
          label="Record payment"
          onPress={submit}
          variant="positive"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
  },
  methods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  outstanding: {
    color: colors.inkSoft,
    fontSize: 13,
    marginTop: 2,
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
    fontSize: 14,
  },
  recipientName: {
    fontWeight: "600",
  },
});

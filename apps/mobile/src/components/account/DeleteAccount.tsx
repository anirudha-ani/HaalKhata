/** Permanent account deletion with explicit confirmation and visible retryable failures. */

import { ACCOUNT_DELETION_CONFIRMATION, ACCOUNT_ERASURE_MESSAGE, SHARED_LEDGER_ERASURE_MESSAGE } from "@haalkhata/shared/account/deletion";
import { formatMoney } from "@haalkhata/shared/money/money";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { TextField } from "@/components/ui/TextField";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { useDeleteAccountAPI } from "./hooks/useDeleteAccountAPI";

/**
 * Shows the irreversible effects before asking for typed confirmation.
 * @returns Delete action and confirmation sheet.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const deletion = useDeleteAccountAPI(open);
  const review = deletion.balanceReview;
  return <View>
    <Button label="Delete account" variant="ghost" onPress={() => { setConfirmation(""); deletion.reset(); setOpen(true); }} />
    {open ? <Sheet title="Permanently delete your account" onClose={() => { if (!deletion.isPending) setOpen(false); }}
      footer={<View style={styles.actions}>
        {deletion.error ? <Text accessibilityRole="alert" style={styles.error}>{deletion.error}</Text> : null}
        <Button label={review.deleteLabel} variant="outline" disabled={confirmation !== ACCOUNT_DELETION_CONFIRMATION} busy={deletion.isPending}
          onPress={() => deletion.remove(confirmation)} />
        <Button label="Keep my account" variant="ghost" disabled={deletion.isPending} onPress={() => setOpen(false)} />
      </View>}>
      <View style={styles.content}>
        <View accessibilityLabel="Balances before deletion" style={styles.balances}>
          <Text accessibilityRole="header" style={styles.heading}>Your outstanding balances</Text>
          <Text accessibilityRole={review.status === "unavailable" ? "alert" : undefined}
            accessibilityLiveRegion="polite" style={styles.text}>{review.message}</Text>
          {review.totals.map((total) => <View key={total.currency} style={styles.currency}>
            <Text style={styles.heading}>{total.currency}</Text>
            <Text style={styles.text}>You owe: {formatMoney(total.youOweCents, total.currency)}</Text>
            <Text style={styles.text}>You are owed: {formatMoney(total.owedToYouCents, total.currency)}</Text>
          </View>)}
          {review.status === "unavailable" ? <Button label="Retry balance check" variant="outline"
            disabled={deletion.isPending} onPress={deletion.retryBalances} /> : null}
          <Button label="Review balances" disabled={deletion.isPending}
            onPress={() => { setOpen(false); deletion.reviewBalances(); }} />
        </View>
        <Text style={styles.text}>{ACCOUNT_ERASURE_MESSAGE}</Text>
        <Text style={styles.text}>{SHARED_LEDGER_ERASURE_MESSAGE}</Text>
        <TextField accessibilityLabel="Type DELETE to confirm" autoCapitalize="characters" autoCorrect={false}
          placeholder="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} editable={!deletion.isPending} />
      </View>
    </Sheet> : null}
  </View>;
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  balances: { backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: radii.md,
    padding: spacing.md, gap: spacing.md },
  currency: { gap: spacing.xs },
  heading: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  content: { gap: spacing.lg },
  text: { color: colors.inkSoft, fontSize: 14, lineHeight: 21 },
  error: { color: colors.neg700, fontSize: 14 },
});

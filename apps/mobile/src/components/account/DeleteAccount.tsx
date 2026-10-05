/** Permanent account deletion with explicit confirmation and visible retryable failures. */

import { ACCOUNT_DELETION_CONFIRMATION, ACCOUNT_ERASURE_MESSAGE, SHARED_LEDGER_ERASURE_MESSAGE } from "@haalkhata/shared/account/deletion";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/lib/theme/theme";
import { useDeleteAccountAPI } from "./hooks/useDeleteAccountAPI";

/**
 * Shows the irreversible effects before asking for typed confirmation.
 * @returns Delete action and confirmation sheet.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const deletion = useDeleteAccountAPI();
  return <View>
    <Button label="Delete account" variant="ghost" onPress={() => { setConfirmation(""); deletion.reset(); setOpen(true); }} />
    {open ? <Sheet title="Permanently delete your account" onClose={() => { if (!deletion.isPending) setOpen(false); }}>
      <View style={styles.content}>
        <Text style={styles.text}>{ACCOUNT_ERASURE_MESSAGE}</Text>
        <Text style={styles.text}>{SHARED_LEDGER_ERASURE_MESSAGE}</Text>
        <TextField accessibilityLabel="Type DELETE to confirm" autoCapitalize="characters" autoCorrect={false}
          placeholder="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} />
        {deletion.error ? <Text accessibilityRole="alert" style={styles.error}>{deletion.error}</Text> : null}
        <Button label="Permanently delete account" disabled={confirmation !== ACCOUNT_DELETION_CONFIRMATION} busy={deletion.isPending}
          onPress={() => deletion.remove(confirmation)} />
        <Button label="Keep my account" variant="outline" disabled={deletion.isPending} onPress={() => setOpen(false)} />
      </View>
    </Sheet> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  text: { color: colors.inkSoft, fontSize: 14, lineHeight: 21 },
  error: { color: colors.neg700, fontSize: 14 },
});

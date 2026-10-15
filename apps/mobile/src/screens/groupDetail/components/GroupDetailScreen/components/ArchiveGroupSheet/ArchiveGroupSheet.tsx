/** Archive popup: a blocked explanation or a confirmation with the consequences. */

import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { colors, spacing } from "@/lib/theme/theme";
import {
  GROUP_ARCHIVE_DIALOG_ACTIONS,
  type GroupArchivePrompt,
} from "@haalkhata/shared/group/archivePrompt";

/**
 * Shows archive feedback at the moment the user asks, before any mutation.
 *
 * @param props - Popup wording, mutation feedback and action callbacks.
 * @returns The archive explanation or confirmation sheet.
 */
export function ArchiveGroupSheet({
  prompt,
  pending,
  error,
  onConfirm,
  onClose,
  onViewBalances,
}: {
  /** Explanation or confirmation chosen from current balances. */
  prompt: GroupArchivePrompt;
  /** Whether the confirmed change is being saved. */
  pending: boolean;
  /** Server refusal, retained inside the popup. */
  error: string;
  /** Saves the confirmed archive state. */
  onConfirm: () => void;
  /** Dismisses the popup without changing the group. */
  onClose: () => void;
  /** Dismisses a blocked popup and opens the group's balances. */
  onViewBalances: () => void;
}) {
  return (
    <Sheet title={prompt.title} onClose={onClose}>
      <View style={styles.body}>
        <Text style={styles.detail}>{prompt.detail}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Button
          disabled={pending}
          label={prompt.confirmLabel ? GROUP_ARCHIVE_DIALOG_ACTIONS.cancel : GROUP_ARCHIVE_DIALOG_ACTIONS.close}
          onPress={onClose}
          variant="outline"
        />
        <Button
          busy={pending}
          label={prompt.confirmLabel ?? GROUP_ARCHIVE_DIALOG_ACTIONS.balances}
          onPress={prompt.confirmLabel ? onConfirm : onViewBalances}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  detail: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
  },
});

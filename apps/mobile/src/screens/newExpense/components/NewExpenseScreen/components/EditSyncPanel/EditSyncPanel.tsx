/** What other people saved while this form was open: a note, and the choice when both changed the same thing. */

import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { useNewExpense } from "../../hooks/useNewExpense";

/**
 * Sits directly above Save, which it holds back while a choice is waiting:
 * nobody can reach the button without reading why it is off.
 *
 * @param props - The form controller.
 * @returns The panel, or nothing when there is nothing to say.
 */
export function EditSyncPanel({ form }: { form: ReturnType<typeof useNewExpense> }) {
  if (!form.editNote && form.editConflicts.length === 0) return null;
  return (
    <View style={styles.panel}>
      {form.editNote ? <Text accessibilityRole="text" style={styles.note}>{form.editNote}</Text> : null}
      {form.editConflicts.map(({ key, text, conflict }) => (
        <View key={key} style={styles.conflict}>
          <Text accessibilityRole="alert" style={styles.conflictText}>{text}</Text>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button compact label="Keep mine" onPress={() => form.keepMyEdit(conflict)} />
            </View>
            <View style={styles.action}>
              <Button
                compact
                label={`Use ${form.editChangedBy}’s`}
                onPress={() => form.takeSavedEdit(conflict)}
                variant="outline"
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  conflict: {
    gap: spacing.sm,
  },
  conflictText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  note: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
});

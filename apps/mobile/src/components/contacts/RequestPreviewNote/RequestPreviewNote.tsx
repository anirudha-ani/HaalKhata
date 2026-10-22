/** The line above found contacts that says what Add sends and quotes the notification they receive. */

import { BellRing } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { addRequestPreview } from "@haalkhata/shared/contacts/contactsCopy";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Shows, before any Add is tapped, exactly what the other person will see,
 * which App Review asks of anything sent to people found through contacts
 * (5.1.2(v)). Every request goes one person at a time from its own row, so
 * one line covers them all.
 *
 * @param props - Component props.
 * @returns The note.
 */
export function RequestPreviewNote({ senderName }: { senderName: string }) {
  return (
    <View style={styles.note}>
      <BellRing color={colors.inkSoft} size={15} />
      <Text style={styles.text}>{addRequestPreview(senderName)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    alignItems: "flex-start",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  text: { color: colors.inkSoft, flex: 1, fontSize: 13, lineHeight: 18 },
});

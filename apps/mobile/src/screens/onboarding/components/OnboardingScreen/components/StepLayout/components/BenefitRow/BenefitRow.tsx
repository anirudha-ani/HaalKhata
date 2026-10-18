/** One reason to take a step: a check and a short line. */

import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders a benefit as a line a person can take in at a glance.
 *
 * @param props - Component props.
 * @returns The row.
 */
export function BenefitRow({ text }: { text: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.tick}>
        <Check color={colors.pos700} size={14} strokeWidth={3} />
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  text: { color: colors.ink, flex: 1, fontSize: 15, lineHeight: 21 },
  tick: {
    alignItems: "center",
    backgroundColor: colors.pos50,
    borderRadius: radii.full,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
});

/** Centered loading spinner with optional label. */

import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/lib/theme/theme";

/** Renders a centered loading indicator with an optional text label beneath it. */
export function Spinner({
  label,
}: {
  /** Text shown under the spinner (e.g. "Loading groups…"). */
  label?: string;
}) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.brand600} size="large" />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
    paddingVertical: 64,
  },
  label: {
    color: colors.inkSoft,
    fontSize: 14,
  },
});

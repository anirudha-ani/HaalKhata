/** Stat tile: one headline number under its label. */

import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders a single figure with a label above it and an optional line of
 * context below. The form for a number that is the whole story: a one-bar
 * chart would say nothing this does not.
 */
export function StatTile({
  label,
  value,
  hint,
}: {
  /** What the number counts, in sentence case. */
  label: string;
  /** The figure, already formatted. */
  value: string;
  /** Optional context under the figure, e.g. what a subset of it is. */
  hint?: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ""}`} style={styles.tile}>
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      <Text numberOfLines={1} style={styles.value}>
        {value}
      </Text>
      {hint ? (
        <Text numberOfLines={1} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
    marginTop: 2,
  },
  label: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  tile: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    // Fills its cell, so a tile without a hint is as tall as its neighbour with one.
    flexGrow: 1,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  value: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "600",
    marginTop: 2,
  },
});

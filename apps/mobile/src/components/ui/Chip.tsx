/** Selectable pill chip used for categories, payment methods, and toggles. */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders a rounded pill that toggles between a muted outline and the
 * brand-tinted selected state.
 */
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  /** The chip's caption. */
  label: string;
  /** Whether the chip is currently selected (brand tint). */
  selected: boolean;
  /** Called when the chip is pressed. */
  onPress: () => void;
  /** Optional leading icon element. */
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      {icon ?? null}
      <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand600,
  },
  label: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "500",
  },
  labelSelected: {
    color: colors.brand700,
  },
});

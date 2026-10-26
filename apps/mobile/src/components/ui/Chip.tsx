/** Selectable pill chip used for categories, payment methods, and toggles. */

import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { FeedbackPressable } from "@/components/ui/FeedbackPressable/FeedbackPressable";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders a rounded pill that toggles between a muted outline and the
 * brand-tinted selected state. A disabled chip keeps its selected tint (it
 * still states a fact) but dims and stops responding, so a locked choice
 * looks locked rather than merely ignoring taps.
 */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  disabled = false,
}: {
  /** The chip's caption. */
  label: string;
  /** Whether the chip is currently selected (brand tint). */
  selected: boolean;
  /** Called when the chip is pressed. */
  onPress: () => void;
  /** Optional leading icon element. */
  icon?: ReactNode;
  /** Whether the chip is locked: dimmed, and presses are ignored. */
  disabled?: boolean;
}) {
  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null, disabled ? styles.chipDisabled : null]}
    >
      {icon ?? null}
      <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
    </FeedbackPressable>
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
    maxWidth: "100%",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipSelected: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand600,
  },
  label: {
    color: colors.inkSoft,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  labelSelected: {
    color: colors.brand700,
  },
});

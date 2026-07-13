/** Pressable action button in the app's four visual variants. */

import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";

/** Visual treatments a button can take. */
export type ButtonVariant = "primary" | "positive" | "outline" | "ghost";

/**
 * Renders a full-width pressable button: brand-filled by default, with
 * positive (settlement green), outline, and ghost variants, a busy spinner
 * state, and an optional leading icon.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  icon,
  compact = false,
}: {
  /** The button's caption. */
  label: string;
  /** Called when the button is pressed (ignored while disabled/busy). */
  onPress: () => void;
  /** Visual treatment; defaults to the brand-filled primary style. */
  variant?: ButtonVariant;
  /** Disables interaction and dims the button. */
  disabled?: boolean;
  /** Shows a spinner instead of dimming — for in-flight mutations. */
  busy?: boolean;
  /** Optional leading icon element. */
  icon?: ReactNode;
  /** Tighter padding for inline placement (e.g. row actions). */
  compact?: boolean;
}) {
  const blocked = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        compact ? styles.compact : null,
        blocked ? styles.blocked : null,
        pressed && !blocked ? styles.pressed : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === "outline" || variant === "ghost" ? colors.brand600 : colors.white} size="small" />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text style={[styles.label, LABEL_COLORS[variant], compact ? styles.labelCompact : null]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Label color per variant. */
const LABEL_COLORS = StyleSheet.create({
  ghost: { color: colors.brand600 },
  outline: { color: colors.inkSoft },
  positive: { color: colors.white },
  primary: { color: colors.white },
});

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  blocked: {
    opacity: 0.5,
  },
  compact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  labelCompact: {
    fontSize: 13,
  },
  outline: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
  },
  positive: {
    backgroundColor: colors.pos600,
  },
  pressed: {
    opacity: 0.85,
  },
  primary: {
    backgroundColor: colors.brand600,
  },
});

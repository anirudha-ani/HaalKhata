/** Square icon-only action for row controls, with the words carried by its accessibility label. */

import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { colors, radii } from "@/lib/theme/theme";

/**
 * Renders a 36-point icon button. Two worded buttons per list row leave a
 * person's name a few characters wide on a phone, so row actions show only
 * their icon and say the full action to assistive tech.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = "outline",
  disabled = false,
  busy = false,
}: {
  /** The icon element, sized by the caller (16 to 18 points reads well). */
  icon: ReactNode;
  /** The full action, e.g. "Accept Nafis Iqbal". */
  accessibilityLabel: string;
  /** Called when pressed (ignored while disabled or busy). */
  onPress: () => void;
  /** `primary` fills with brand colour; `outline` is a hairline box. */
  variant?: "primary" | "outline";
  /** Disables interaction and dims the button. */
  disabled?: boolean;
  /** Shows a spinner in place of the icon. */
  busy?: boolean;
}) {
  const blocked = disabled || busy;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" ? styles.primary : styles.outline,
        blocked ? styles.blocked : null,
        pressed && !blocked ? styles.pressed : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.white : colors.brand600}
          size="small"
        />
      ) : (
        icon
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  blocked: {
    opacity: 0.5,
  },
  outline: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  primary: {
    backgroundColor: colors.brand600,
  },
});

/** Square icon-only action for row controls, with the words carried by its accessibility label. */

import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { FeedbackPressable } from "@/components/ui/FeedbackPressable/FeedbackPressable";
import { colors, radii } from "@/lib/theme/theme";

/**
 * Renders a 44-point icon button. Two worded buttons per list row leave a
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
    <FeedbackPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      hitSlop={4}
      onPress={onPress}
      style={[
        styles.base,
        variant === "primary" ? styles.primary : styles.outline,
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
    </FeedbackPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  outline: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.brand600,
  },
});

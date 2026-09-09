/** Floating error toast: a dismissible alert pinned to the top of the screen. */

import { CircleAlert, X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { ERROR_TOAST_AUTO_DISMISS_MS } from "./ui.constants";

/**
 * Renders an error pinned to the top of the screen, over whatever is
 * scrolling beneath it, so it is seen wherever on the page the action that
 * failed happened. A line of text at the bottom of a long form is missed by
 * whoever just tapped a button at the top of it. Closes on the dismiss
 * button or on its own after {@link ERROR_TOAST_AUTO_DISMISS_MS}.
 *
 * Renders nothing when `message` is empty.
 */
export function ErrorToast({
  message,
  onDismiss,
}: {
  /** The error text to show; an empty string hides the toast. */
  message: string;
  /** Called when the toast closes, by tap or by timeout. */
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, ERROR_TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={styles.host}>
      <View accessibilityRole="alert" style={styles.toast}>
        <CircleAlert color={colors.brand600} size={18} />
        <Text style={styles.message}>{message}</Text>
        <Pressable
          accessibilityLabel="Dismiss"
          hitSlop={8}
          onPress={onDismiss}
          style={styles.dismiss}
        >
          <X color={colors.brand600} size={16} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dismiss: {
    borderRadius: radii.full,
    padding: 2,
  },
  host: {
    alignItems: "center",
    left: 0,
    paddingHorizontal: spacing.lg,
    position: "absolute",
    right: 0,
    top: spacing.md,
    zIndex: 50,
  },
  message: {
    color: colors.brand700,
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 19,
  },
  toast: {
    alignItems: "flex-start",
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 6,
    flexDirection: "row",
    gap: spacing.sm + 2,
    maxWidth: 480,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: colors.ink,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    width: "100%",
  },
});

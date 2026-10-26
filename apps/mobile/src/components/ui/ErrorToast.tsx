/** Floating error toast: a dismissible alert pinned to the top of the screen. */

import { CircleAlert, X } from "lucide-react-native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { Text } from "@/components/ui/Text";
import { FeedbackPressable } from "@/components/ui/FeedbackPressable/FeedbackPressable";
import { dropIn, FADE_OUT, FADE_OUT_UP } from "@/lib/motion/entrances";
import { errorFeedback } from "@/lib/motion/haptics";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { ERROR_TOAST_AUTO_DISMISS_MS } from "./ui.constants";

/**
 * Renders an error pinned to the top of the screen, over whatever is
 * scrolling beneath it, so it is seen wherever on the page the action that
 * failed happened. A line of text at the bottom of a long form is missed by
 * whoever just tapped a button at the top of it. Closes on the dismiss
 * button or on its own after {@link ERROR_TOAST_AUTO_DISMISS_MS}.
 *
 * It drops in from the top edge with an error tap (Apple's haptic for a
 * failed action), and slides back up when it closes; under Reduce Motion it
 * fades. Renders nothing when `message` is empty.
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
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (!message) return;
    errorFeedback();
    const timer = setTimeout(onDismiss, ERROR_TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Animated.View
        accessibilityRole="alert"
        entering={dropIn(0, reduceMotion)}
        exiting={reduceMotion ? FADE_OUT : FADE_OUT_UP}
        key={message}
        style={styles.toast}
      >
        <CircleAlert color={colors.brand600} size={18} />
        <Text style={styles.message}>{message}</Text>
        <FeedbackPressable
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={styles.dismiss}
        >
          <X color={colors.brand600} size={16} />
        </FeedbackPressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dismiss: {
    alignItems: "center",
    borderRadius: radii.full,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
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
    alignItems: "center",
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

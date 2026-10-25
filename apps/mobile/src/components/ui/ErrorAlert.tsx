/** Error alert: a failed read said in place, beside what is still on screen, with a way to try again. */

import { RotateCw } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { Button } from "./Button";

/**
 * Says that something failed to load and why, where its content would be,
 * so a failure never reads as nothing there. Unlike ErrorState, which takes
 * a whole screen's place, it sits among content that did load: above a
 * list whose reload failed, or above the button that asks for the next
 * page.
 *
 * @param props - The whole sentence, and a retry when no control below already is one.
 * @returns The alert.
 */
export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={styles.alert}>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? (
        <Button
          compact
          icon={<RotateCw color={colors.inkSoft} size={14} />}
          label="Try again"
          onPress={onRetry}
          variant="outline"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  alert: {
    backgroundColor: colors.neg50,
    borderColor: colors.neg600,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  text: {
    color: colors.neg700,
    fontSize: 14,
    fontWeight: "500",
  },
});

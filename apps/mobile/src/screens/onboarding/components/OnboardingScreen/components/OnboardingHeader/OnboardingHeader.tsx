/** The flow's top bar: back while going back is possible, and a segmented step indicator. */

import { ChevronLeft } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { stepLabel } from "../../../../constants/onboardingCopy";
import { ProgressSegment } from "./components/ProgressSegment/ProgressSegment";

/**
 * Renders one segment per step, filled up to the current one, so the person
 * always sees how much is left (a wizard should never hide its length). The
 * back chevron appears only while the account steps can still be revisited;
 * past that point a step has asked the phone for something and going back
 * would only repeat it.
 *
 * @param props - Component props.
 * @returns The header.
 */
export function OnboardingHeader({
  position,
  total,
  onBack,
}: {
  /** The current step, from 1. */
  position: number;
  total: number;
  /** Goes back a step; absent when that is not possible. */
  onBack?: () => void;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {onBack ? (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.back}>
              <ChevronLeft color={colors.ink} size={24} />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
      <View
        accessibilityLabel={stepLabel(position, total)}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: position }}
        accessible
        style={styles.segments}
      >
        {Array.from({ length: total }, (_unused, index) => (
          <ProgressSegment filled={index < position} key={index} />
        ))}
      </View>
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: "center", borderRadius: radii.full, height: 44, justifyContent: "center", width: 44 },
  bar: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  segments: { flex: 1, flexDirection: "row", gap: spacing.xs, maxWidth: 360 },
  side: { alignItems: "flex-start", width: 44 },
});

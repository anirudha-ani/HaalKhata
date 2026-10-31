/** Two sample notifications dropping in from the top, the way they would arrive on the phone. */

import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { dropInAfter } from "@/lib/motion/entrances";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { spacing } from "@/lib/theme/theme";
import { PREVIEW_BANNER_DELAYS_MS } from "../../../../../../constants/onboarding";
import { NOTIFICATIONS_STEP } from "../../../../../../constants/onboardingCopy";
import { PreviewBanner } from "./components/PreviewBanner/PreviewBanner";

/**
 * Shows an expense added with the reader's share, then a payment, as banners
 * that drop in a beat after the step appears, one after the other (they fade
 * in place under Reduce Motion).
 * The wording follows what the server actually sends: the title names who,
 * the body says what happened, where, and what it means for the reader.
 *
 * @returns The preview.
 */
export function NotificationPreview() {
  const reduceMotion = useReduceMotion();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stack}>
      {NOTIFICATIONS_STEP.previews.map((preview, index) => (
        <Animated.View
          entering={dropInAfter(PREVIEW_BANNER_DELAYS_MS.at(index) ?? 0, reduceMotion)}
          key={preview.title}
        >
          <PreviewBanner body={preview.body} title={preview.title} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: "center", gap: spacing.sm, minHeight: 150 },
});

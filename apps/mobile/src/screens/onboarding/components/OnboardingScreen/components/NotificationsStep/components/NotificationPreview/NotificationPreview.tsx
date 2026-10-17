/** Two sample notifications dropping in from the top, the way they would arrive on the phone. */

import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInUp, ReduceMotion } from "react-native-reanimated";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { spacing } from "@/lib/theme/theme";
import { NOTIFICATIONS_STEP } from "../../../../../../constants/onboardingCopy";
import { PreviewBanner } from "./components/PreviewBanner/PreviewBanner";

/** Each banner drops in a beat after the step appears, the second after the first. */
const BANNER_ENTERING = [260, 820].map((delay) => FadeInUp.springify(460).dampingRatio(0.82).delay(delay));

/** Under Reduce Motion they fade in place. */
const BANNER_FADE = [200, 500].map((delay) => FadeIn.delay(delay).reduceMotion(ReduceMotion.Never));

/**
 * Shows an expense added with the reader's share, then a payment, as banners.
 * The wording follows what the server actually sends: the title names who
 * did what, the second line says what it means for the reader.
 *
 * @returns The preview.
 */
export function NotificationPreview() {
  const reduceMotion = useReduceMotion();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stack}>
      {NOTIFICATIONS_STEP.previews.map((preview, index) => (
        <Animated.View entering={(reduceMotion ? BANNER_FADE : BANNER_ENTERING)[index]} key={preview.title}>
          <PreviewBanner body={preview.body} title={preview.title} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: "center", gap: spacing.sm, minHeight: 150 },
});

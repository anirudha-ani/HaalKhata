/** One page of the welcome pager: a step's illustration above its number, title and detail. */

import { StyleSheet, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import type { WelcomeStep } from "@haalkhata/shared/welcome/welcomeCopy";
import { Text } from "@/components/ui/Text";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { colors, fonts, spacing } from "@/lib/theme/theme";
import { ILLUSTRATION_PARALLAX } from "@/screens/login/constants/welcome";
import { ScanIllustration } from "../ScanIllustration/ScanIllustration";
import { SettleIllustration } from "../SettleIllustration/SettleIllustration";
import { SplitIllustration } from "../SplitIllustration/SplitIllustration";

/**
 * Renders the step full-width inside the pager. While the page is swiped,
 * its illustration trails the page a little and dims with distance, which
 * gives the swipe depth without moving the words (they stay put to read).
 * Under Reduce Motion the illustration moves with its page.
 *
 * @param props - Component props.
 * @returns The page.
 */
export function StoryPage({
  step,
  index,
  active,
  pageWidth,
  scrollX,
  illustrationHeight,
}: {
  step: WelcomeStep;
  /** Position in the pager, which also picks the illustration. */
  index: number;
  /** Whether this page is the settled one, which plays its illustration. */
  active: boolean;
  pageWidth: number;
  /** The pager's live scroll offset. */
  scrollX: SharedValue<number>;
  illustrationHeight: number;
}) {
  const reduceMotion = useReduceMotion();
  const parallaxStyle = useAnimatedStyle(() => {
    const range = [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth];
    const trail = reduceMotion ? 0 : pageWidth * ILLUSTRATION_PARALLAX;
    return {
      opacity: interpolate(scrollX.value, range, [0.35, 1, 0.35], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(scrollX.value, range, [-trail, 0, trail], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[styles.page, { width: pageWidth }]}>
      <Animated.View style={[styles.illustration, { height: illustrationHeight }, parallaxStyle]}>
        {index === 0 ? (
          <ScanIllustration active={active} />
        ) : index === 1 ? (
          <SplitIllustration active={active} />
        ) : (
          <SettleIllustration active={active} />
        )}
      </Animated.View>
      <View style={styles.words}>
        <Text style={styles.eyebrow}>{`${step.number} · ${step.title.toUpperCase()}`}</Text>
        <Text accessibilityRole="header" style={styles.title}>{step.title}</Text>
        <Text style={styles.detail}>{step.detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { color: colors.inkSoft, fontSize: 15, lineHeight: 22, textAlign: "center" },
  eyebrow: { color: colors.brand600, fontSize: 11, fontWeight: "700", letterSpacing: 1.6 },
  illustration: { alignItems: "center", justifyContent: "center" },
  page: { gap: spacing.lg, paddingHorizontal: spacing.xl },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: "700" },
  words: { alignItems: "center", gap: spacing.xs },
});

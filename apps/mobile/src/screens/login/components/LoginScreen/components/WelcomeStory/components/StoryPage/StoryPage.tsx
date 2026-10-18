/** One page of the welcome pager: a step's illustration above its number, title and detail. */

import { StyleSheet, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import type { WelcomeStep } from "@haalkhata/shared/welcome/welcomeCopy";
import { Text } from "@/components/ui/Text";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { colors, fonts, spacing } from "@/lib/theme/theme";
import { ILLUSTRATION_NATURAL_HEIGHT, ILLUSTRATION_PARALLAX } from "@/screens/login/constants/welcome";
import { ScanIllustration } from "../ScanIllustration/ScanIllustration";
import { SettleIllustration } from "../SettleIllustration/SettleIllustration";
import { SplitIllustration } from "../SplitIllustration/SplitIllustration";

/**
 * Renders the step full-width inside the pager. While the page is swiped,
 * its illustration travels a little faster than the page and dims with
 * distance, which gives the swipe depth; the words move with the page. A
 * resting page's neighbors stay fully off screen. Under Reduce Motion the
 * illustration moves with its page.
 *
 * The illustration is drawn at its natural size and scaled down to the
 * height it is given, so a smaller phone shows the whole scene, smaller.
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
      transform: [{ translateX: interpolate(scrollX.value, range, [trail, 0, -trail], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[styles.page, { width: pageWidth }]}>
      <Animated.View style={[styles.illustration, { height: illustrationHeight }, parallaxStyle]}>
        <View style={{ transform: [{ scale: Math.min(1, illustrationHeight / ILLUSTRATION_NATURAL_HEIGHT) }] }}>
          {index === 0 ? (
            <ScanIllustration active={active} />
          ) : index === 1 ? (
            <SplitIllustration active={active} />
          ) : (
            <SettleIllustration active={active} />
          )}
        </View>
      </Animated.View>
      <View style={styles.words}>
        <Text accessibilityRole="header" style={styles.title}>
          <Text style={styles.number}>{`${step.number}  `}</Text>
          {step.title}
        </Text>
        <Text style={styles.detail}>{step.detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { color: colors.inkSoft, fontSize: 15, lineHeight: 22, textAlign: "center" },
  illustration: { alignItems: "center", justifyContent: "center" },
  number: { color: colors.brand600, fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  page: { gap: spacing.md, paddingHorizontal: spacing.xl },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: "700" },
  words: { alignItems: "center", gap: spacing.xs },
});

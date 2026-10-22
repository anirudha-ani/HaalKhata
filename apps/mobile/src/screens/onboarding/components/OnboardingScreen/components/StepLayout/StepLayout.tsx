/** The shape every step shares: art, title, words and reasons that scroll, over actions that stay put. */

import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/Text";
import { riseIn } from "@/lib/motion/entrances";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { FOCUSED_CONTENT_MAX_WIDTH } from "@/lib/layout/constants/layout";
import { colors, fonts, spacing } from "@/lib/theme/theme";
import { BenefitRow } from "./components/BenefitRow/BenefitRow";

/**
 * Lays out one step. The art, words, reasons and the step's own controls
 * arrive in a short stagger and scroll if they must (large text, a small
 * phone, the keyboard up); the footer with the step's actions is pinned at
 * the bottom edge, above the keyboard, so the way forward is never
 * scrolled away. On iPad the column keeps a readable width, centered.
 *
 * @param props - Component props.
 * @returns The step.
 */
export function StepLayout({
  art,
  title,
  body,
  benefits = [],
  children,
  footer,
}: {
  /** Drawing above the title. */
  art?: ReactNode;
  title: string;
  body?: string;
  /** Short reasons to take the step, shown as checked lines. */
  benefits?: readonly string[];
  /** The step's own controls. */
  children?: ReactNode;
  /** The step's actions, pinned to the bottom. */
  footer: ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.step}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          {art ? (
            <Animated.View entering={riseIn(0, reduceMotion)} style={styles.art}>
              {art}
            </Animated.View>
          ) : null}
          <Animated.View entering={riseIn(1, reduceMotion)} style={styles.words}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            {body ? <Text style={styles.body}>{body}</Text> : null}
          </Animated.View>
          {benefits.length > 0 ? (
            <View style={styles.benefits}>
              {benefits.map((benefit, index) => (
                <Animated.View entering={riseIn(2 + index, reduceMotion)} key={benefit}>
                  <BenefitRow text={benefit} />
                </Animated.View>
              ))}
            </View>
          ) : null}
          {children ? (
            <Animated.View entering={riseIn(2 + benefits.length, reduceMotion)} style={styles.controls}>
              {children}
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.footerColumn}>{footer}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: "center" },
  benefits: { gap: spacing.md },
  body: { color: colors.inkSoft, fontSize: 16, lineHeight: 23, textAlign: "center" },
  column: { alignSelf: "center", gap: spacing.xl, maxWidth: FOCUSED_CONTENT_MAX_WIDTH, width: "100%" },
  controls: { gap: spacing.lg },
  footer: {
    backgroundColor: colors.paper,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  footerColumn: { alignSelf: "center", gap: spacing.sm, maxWidth: FOCUSED_CONTENT_MAX_WIDTH, width: "100%" },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  step: { flex: 1 },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 33,
    textAlign: "center",
  },
  words: { gap: spacing.sm },
});

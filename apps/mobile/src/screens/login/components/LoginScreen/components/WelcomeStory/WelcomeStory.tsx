/** The signed-out story: the headline promise, then the three steps in a pager the person swipes themselves. */

import { LockKeyhole } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { RECEIPT_PRIVACY_MESSAGE } from "@haalkhata/shared/legal/privacyCopy";
import { WELCOME_HERO, WELCOME_STEPS } from "@haalkhata/shared/welcome/welcomeCopy";
import { Text } from "@/components/ui/Text";
import { riseIn } from "@/lib/motion/entrances";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { colors, fonts, spacing } from "@/lib/theme/theme";
import { PageDots } from "./components/PageDots/PageDots";
import { StoryPage } from "./components/StoryPage/StoryPage";
import { useStoryPager } from "./hooks/useStoryPager";

/**
 * Tells a newcomer what HaalKhata does before they are asked to sign in,
 * the way the web's landing page does, in the same words. The headline
 * stays put; below it, "Snap it", "Split it" and "Clear it" each get a page
 * with a small animated scene. Three pages at most, nothing advances by
 * itself, and none of it stands between a returning person and the sign-in
 * buttons, which live outside this component.
 *
 * Content arrives in a short stagger on first launch (a fade under Reduce
 * Motion).
 *
 * @param props - Component props.
 * @returns The story.
 */
export function WelcomeStory({
  illustrationHeight,
  showBody,
}: {
  /** Height of each step's illustration. */
  illustrationHeight: number;
  /**
   * Whether there is room for the hero's eyebrow, supporting paragraph and
   * the receipt privacy line (iPad). A phone keeps the headline, the steps
   * and the sign-in panel on one screen instead.
   */
  showBody: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const pager = useStoryPager(WELCOME_STEPS.length);

  return (
    <View style={styles.story}>
      <Animated.View entering={riseIn(1, reduceMotion)} style={styles.hero}>
        {showBody ? <Text style={styles.eyebrow}>{WELCOME_HERO.eyebrow.toUpperCase()}</Text> : null}
        <Text accessibilityRole="header" style={[styles.heroTitle, showBody ? styles.heroTitleLarge : null]}>
          {`${WELCOME_HERO.titleLead}\n`}
          <Text style={styles.heroAccent}>{WELCOME_HERO.titleAccent}</Text>
        </Text>
        {showBody ? <Text style={styles.heroBody}>{WELCOME_HERO.body}</Text> : null}
      </Animated.View>

      <Animated.View entering={riseIn(2, reduceMotion)} onLayout={pager.onLayout} style={styles.pager}>
        {pager.pageWidth > 0 ? (
          <Animated.ScrollView
            decelerationRate="fast"
            horizontal
            onMomentumScrollEnd={pager.onMomentumScrollEnd}
            onScroll={pager.onScroll}
            pagingEnabled
            ref={pager.scrollRef}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
          >
            {WELCOME_STEPS.map((step, index) => (
              <StoryPage
                active={pager.page === index}
                illustrationHeight={illustrationHeight}
                index={index}
                key={step.number}
                pageWidth={pager.pageWidth}
                scrollX={pager.scrollX}
                step={step}
              />
            ))}
          </Animated.ScrollView>
        ) : (
          <View style={{ height: illustrationHeight }} />
        )}
      </Animated.View>

      <Animated.View entering={riseIn(3, reduceMotion)} style={styles.footer}>
        <PageDots
          count={WELCOME_STEPS.length}
          onSelect={pager.goTo}
          page={pager.page}
          pageWidth={pager.pageWidth}
          scrollX={pager.scrollX}
        />
        {showBody ? (
          <View style={styles.privacy}>
            <LockKeyhole color={colors.inkSoft} size={13} />
            <Text style={styles.privacyText}>{RECEIPT_PRIVACY_MESSAGE}</Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brand700, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textAlign: "center" },
  footer: { alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.xl },
  hero: { gap: spacing.sm, paddingHorizontal: spacing.xl },
  heroAccent: { color: colors.brand600 },
  heroBody: { color: colors.inkSoft, fontSize: 16, lineHeight: 24, textAlign: "center" },
  heroTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 34,
    textAlign: "center",
  },
  heroTitleLarge: { fontSize: 44, letterSpacing: -0.8, lineHeight: 48 },
  pager: { alignSelf: "stretch" },
  privacy: { alignItems: "flex-start", flexDirection: "row", gap: spacing.xs, maxWidth: 340 },
  privacyText: { color: colors.inkSoft, flexShrink: 1, fontSize: 12, lineHeight: 17 },
  story: { gap: spacing.md },
});

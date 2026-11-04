/** Welcome screen: what HaalKhata is, with Apple and Google sign-in always within reach. */

import { useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Spinner } from "@/components/ui/Spinner";
import { Text } from "@/components/ui/Text";
import { dropIn } from "@/lib/motion/entrances";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import brandIconSource from "../../../../../assets/icon.png";
import {
  ILLUSTRATION_MAX_HEIGHT,
  ILLUSTRATION_MIN_HEIGHT,
  STORY_WORDS_HEIGHT,
  TABLET_ILLUSTRATION_HEIGHT,
  WELCOME_TABLET_MAX_WIDTH,
} from "../../constants/welcome";
import { DevPasswordButton } from "./components/DevPasswordButton/DevPasswordButton";
import { SignInPanel } from "./components/SignInPanel/SignInPanel";
import { WelcomeStory } from "./components/WelcomeStory/WelcomeStory";
import { useLeaveWhenSignedIn } from "./hooks/useLeaveWhenSignedIn";

/**
 * The first screen a signed-out person sees, playing the part the web's
 * landing page plays: the promise, the three steps, and the way in.
 *
 * On a phone the story scrolls if it has to (small phones, large text) while
 * the sign-in panel stays docked at the bottom, so a returning person's
 * thumb lands on "Continue with Apple" without reading a word. On an iPad
 * window wide enough for it, the story and a sign-in card sit side by side;
 * a narrow Split View window or iPhone Duo's inner display held upright gets
 * the phone layout.
 *
 * Somebody signed in is never shown it: once a session exists, from a
 * sign-in here or from before they arrived, a spinner stands in while the
 * screen leaves for a waiting invitation or Home.
 *
 * @returns The welcome screen, or a spinner while it leaves.
 */
export function LoginScreen() {
  const leaving = useLeaveWhenSignedIn();
  const { isSpacious, isLargeText, fontScale } = useResponsiveLayout();
  const sideBySide = isSpacious && !isLargeText;
  const reduceMotion = useReduceMotion();
  // The space between the brand and the docked panel, measured, so the
  // panel's real height (which differs between builds and text sizes)
  // decides it. Keep the story mounted while that measurement changes.
  const [storyViewport, setStoryViewport] = useState(0);
  // What the headline, the step's words and the dots leave over goes to the
  // illustration, so the whole page fits; past the smallest illustration the
  // story scrolls while the panel stays put.
  const phoneIllustrationHeight = Math.min(
    ILLUSTRATION_MAX_HEIGHT,
    Math.max(ILLUSTRATION_MIN_HEIGHT, storyViewport - STORY_WORDS_HEIGHT * Math.max(1, fontScale)),
  );

  if (leaving) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.leaving]}>
        <Spinner />
      </SafeAreaView>
    );
  }

  const brand = (
    <Animated.View entering={dropIn(0, reduceMotion)} style={styles.brand}>
      <Image accessibilityIgnoresInvertColors source={brandIconSource} style={styles.brandIcon} />
      <View style={styles.brandWords}>
        <Text accessibilityRole="header" adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.wordmark}>HaalKhata</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.brandTagline}>
          THE SHARED-EXPENSE LEDGER
        </Text>
      </View>
      <DevPasswordButton />
    </Animated.View>
  );

  // Keep the same tree through a fold: replacing the phone and tablet trees
  // dismisses the password dialog and resets an in-flight provider sign-in.
  return (
    <SafeAreaView edges={sideBySide ? undefined : ["top", "left", "right"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={sideBySide ? styles.tabletScroll : styles.flexOne}
        scrollEnabled={sideBySide}
        showsVerticalScrollIndicator={false}
        style={styles.flexOne}
      >
        <View style={sideBySide ? styles.tabletColumns : styles.flexOne}>
          <View style={sideBySide ? styles.tabletStory : styles.flexOne}>
            <View style={sideBySide ? undefined : styles.phoneHeader}>{brand}</View>
            <ScrollView
              contentContainerStyle={sideBySide ? undefined : styles.phoneScroll}
              onLayout={(event) => setStoryViewport(Math.round(event.nativeEvent.layout.height))}
              scrollEnabled={!sideBySide}
              showsVerticalScrollIndicator={false}
              style={sideBySide ? undefined : styles.flexOne}
            >
              <WelcomeStory
                illustrationHeight={sideBySide ? TABLET_ILLUSTRATION_HEIGHT : phoneIllustrationHeight}
                showBody={sideBySide}
              />
            </ScrollView>
          </View>
          <View style={sideBySide ? styles.tabletPanel : undefined}>
            <SignInPanel variant={sideBySide ? "card" : "dock"} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  brandIcon: { borderRadius: radii.md, height: 40, width: 40 },
  brandTagline: { color: colors.inkSoft, fontSize: 9, fontWeight: "700", letterSpacing: 1.6, marginTop: 2 },
  brandWords: { flex: 1, minWidth: 140 },
  flexOne: { flex: 1 },
  leaving: { justifyContent: "center" },
  phoneHeader: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  phoneScroll: { flexGrow: 1, justifyContent: "center", paddingBottom: spacing.lg },
  safeArea: { backgroundColor: colors.paper, flex: 1 },
  tabletColumns: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.xxl,
    maxWidth: WELCOME_TABLET_MAX_WIDTH,
    width: "100%",
  },
  tabletPanel: { flex: 1, maxWidth: 420 },
  tabletScroll: { flexGrow: 1, justifyContent: "center", padding: spacing.xxl },
  tabletStory: { flex: 1.3, gap: spacing.xxl },
  wordmark: { color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "700" },
});

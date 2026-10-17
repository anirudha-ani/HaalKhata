/** Welcome screen: what HaalKhata is, with Apple and Google sign-in always within reach. */

import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/Text";
import { dropIn } from "@/lib/motion/entrances";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import brandIconSource from "../../../../../assets/icon.png";
import {
  ILLUSTRATION_MAX_HEIGHT,
  ILLUSTRATION_MIN_HEIGHT,
  PHONE_RESERVED_HEIGHT,
  TABLET_ILLUSTRATION_HEIGHT,
  WELCOME_TABLET_MAX_WIDTH,
} from "../../constants/welcome";
import { SignInPanel } from "./components/SignInPanel/SignInPanel";
import { WelcomeStory } from "./components/WelcomeStory/WelcomeStory";

/**
 * The first screen a signed-out person sees, playing the part the web's
 * landing page plays: the promise, the three steps, and the way in.
 *
 * On a phone the story scrolls if it has to (small phones, large text) while
 * the sign-in panel stays docked at the bottom, so a returning person's
 * thumb lands on "Continue with Apple" without reading a word. On an iPad
 * window wide enough for it, the story and a sign-in card sit side by side;
 * a narrow Split View window gets the phone layout.
 *
 * @returns The welcome screen.
 */
export function LoginScreen() {
  const { isTablet, fontScale } = useResponsiveLayout();
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  // What the headline, words and panel leave over goes to the illustration,
  // so a 6.1-inch phone shows the whole page without scrolling; larger text
  // or a smaller phone scrolls the story while the panel stays put.
  const phoneIllustrationHeight = Math.min(
    ILLUSTRATION_MAX_HEIGHT,
    Math.max(ILLUSTRATION_MIN_HEIGHT, height - PHONE_RESERVED_HEIGHT * Math.max(1, fontScale)),
  );

  const brand = (
    <Animated.View entering={dropIn(0, reduceMotion)} style={styles.brand}>
      <Image accessibilityIgnoresInvertColors source={brandIconSource} style={styles.brandIcon} />
      <View>
        <Text accessibilityRole="header" style={styles.wordmark}>HaalKhata</Text>
        <Text style={styles.brandTagline}>THE SHARED-EXPENSE LEDGER</Text>
      </View>
    </Animated.View>
  );

  if (isTablet) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.tabletScroll}>
          <View style={styles.tabletColumns}>
            <View style={styles.tabletStory}>
              {brand}
              <WelcomeStory illustrationHeight={TABLET_ILLUSTRATION_HEIGHT} showBody />
            </View>
            <View style={styles.tabletPanel}>
              <SignInPanel variant="card" />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <View style={styles.phoneHeader}>{brand}</View>
      <ScrollView
        contentContainerStyle={styles.phoneScroll}
        showsVerticalScrollIndicator={false}
        style={styles.flexOne}
      >
        <WelcomeStory illustrationHeight={phoneIllustrationHeight} showBody={false} />
      </ScrollView>
      <SignInPanel variant="dock" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  brandIcon: { borderRadius: radii.md, height: 40, width: 40 },
  brandTagline: { color: colors.inkSoft, fontSize: 9, fontWeight: "700", letterSpacing: 1.6, marginTop: 2 },
  flexOne: { flex: 1 },
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

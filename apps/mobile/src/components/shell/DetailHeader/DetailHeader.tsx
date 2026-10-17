/** Header for pushed detail screens: back button, what the screen is about, optional right action. */

import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { HEADER_TITLE_MIN_SCALE, SCREEN_CONTENT_MAX_WIDTH } from "@/lib/layout/constants/layout";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the chrome above pushed (non-tab) screens: a back chevron, the
 * screen title in the display serif, and an optional right-side action.
 *
 * A screen about one group or one person is named here, with its emoji
 * tile or avatar as `leading` and a line about it as `subtitle`, and does
 * not repeat that in a heading of its own: the bar stays put while the
 * screen scrolls, so the name is always in view, and a second copy under
 * it would only spend the top of the screen saying it twice.
 */
export function DetailHeader({
  title,
  subtitle,
  leading,
  right,
}: {
  /** Screen title; truncated to one line. */
  title: string;
  /** Optional second line under the title, e.g. a group's type and currency. */
  subtitle?: string;
  /** Optional picture before the title: an emoji tile or an avatar, 36 points. */
  leading?: ReactNode;
  /** Optional element rendered at the trailing edge (e.g. an action button). */
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <Pressable
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/dashboard"))}
          style={styles.backButton}
        >
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.titleBlock}>
          {/* A long name gives up a little size before it gives up letters:
              this bar is the only place a group's or a person's name is shown. */}
          <Text
            accessibilityRole="header"
            adjustsFontSizeToFit
            minimumFontScale={HEADER_TITLE_MIN_SCALE}
            numberOfLines={1}
            style={[styles.title, subtitle ? styles.titleWithSubtitle : null]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
    flexShrink: 0,
    padding: spacing.xs,
  },
  header: {
    backgroundColor: colors.card,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  headerContent: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: SCREEN_CONTENT_MAX_WIDTH,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    width: "100%",
  },
  leading: {
    flexShrink: 0,
  },
  right: {
    flexShrink: 0,
    marginLeft: "auto",
  },
  subtitle: {
    color: colors.inkSoft,
    fontSize: 12,
    marginTop: 1,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "600",
  },
  titleBlock: {
    flexShrink: 1,
    minWidth: 0,
  },
  titleWithSubtitle: {
    fontSize: 17,
  },
});

/** Header for pushed detail screens: back button, optional title, optional right action. */

import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { SCREEN_CONTENT_MAX_WIDTH } from "@/lib/layout/constants/layout";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the chrome above pushed (non-tab) screens: a back chevron, the
 * screen title in the display serif, and an optional right-side action.
 *
 * Leave the title out when the screen opens on its own heading — a group's
 * or a person's name with their picture. Said in both places, the bar
 * repeats the heading right under it, cut short.
 */
export function DetailHeader({
  title,
  right,
}: {
  /** Screen title; truncated to one line. Omit when the screen's content names itself. */
  title?: string;
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
        {title ? (
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        ) : null}
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
    paddingVertical: spacing.md,
    width: "100%",
  },
  right: {
    flexShrink: 0,
    marginLeft: "auto",
  },
  title: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "600",
  },
});

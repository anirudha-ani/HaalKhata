/** Header for pushed detail screens: back button, title, optional right action. */

import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SCREEN_CONTENT_MAX_WIDTH } from "@/components/shell/shell.constants";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the chrome above pushed (non-tab) screens: a back chevron, the
 * screen title in the display serif, and an optional right-side action.
 */
export function DetailHeader({
  title,
  right,
}: {
  /** Screen title; truncated to one line. */
  title: string;
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
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    borderRadius: radii.full,
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

/** Scrollable screen container: safe area, paper background, padding, pull-to-refresh. */

import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SCREEN_CONTENT_MAX_WIDTH } from "@/components/shell/shell.constants";
import { useResponsiveLayout } from "@/components/shell/hooks/useResponsiveLayout";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Wraps screen content in the app's standard scaffold: a safe-area view on
 * the paper background and a keyboard-friendly scroll view with consistent
 * padding. Passing `onRefresh` enables pull-to-refresh.
 */
export function Screen({
  children,
  header,
  refreshing = false,
  onRefresh,
}: {
  /** The scrollable screen content. */
  children: ReactNode;
  /** Fixed chrome rendered above the scroll view (e.g. ScreenHeader). */
  header?: ReactNode;
  /** Whether the pull-to-refresh spinner is active. */
  refreshing?: boolean;
  /** Called on pull-to-refresh; omitting it disables the gesture. */
  onRefresh?: () => void;
}) {
  const { isTablet } = useResponsiveLayout();
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, isTablet ? styles.contentTablet : null]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              onRefresh={onRefresh}
              refreshing={refreshing}
              tintColor={colors.brand600}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: "center",
    gap: spacing.xl,
    maxWidth: SCREEN_CONTENT_MAX_WIDTH,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    width: "100%",
  },
  contentTablet: {
    padding: spacing.xxl,
    paddingBottom: spacing.xxl * 2,
  },
  safeArea: {
    backgroundColor: colors.paper,
    flex: 1,
  },
});

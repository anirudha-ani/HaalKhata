/** Scrollable screen container: safe area, paper background, padding, pull-to-refresh, and the error toast layer. */

import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SCREEN_CONTENT_MAX_WIDTH } from "@/components/shell/shell.constants";
import { useResponsiveLayout } from "@/components/shell/hooks/useResponsiveLayout";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Wraps screen content in the app's standard scaffold: a safe-area view on
 * the paper background and a keyboard-friendly scroll view with consistent
 * padding. Passing `onRefresh` enables pull-to-refresh. Errors raised by the
 * content surface through the toast layer this scaffold hosts (see
 * `useErrorToast`), pinned over the header and the scroll view alike.
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
      <ToastProvider>
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
      </ToastProvider>
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

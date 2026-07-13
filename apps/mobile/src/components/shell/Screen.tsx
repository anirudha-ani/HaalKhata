/** Scrollable screen container: safe area, paper background, padding, pull-to-refresh. */

import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
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
    gap: spacing.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  safeArea: {
    backgroundColor: colors.paper,
    flex: 1,
  },
});

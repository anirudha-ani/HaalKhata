/** Scrollable screen container: safe area, paper background, padding, pull-to-refresh, and the error toast layer. */

import { useCallback, useRef, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, type HostInstance, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SCREEN_CONTENT_MAX_WIDTH } from "@/lib/layout/constants/layout";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { colors, spacing } from "@/lib/theme/theme";
import { ScreenRevealContext } from "./hooks/useRevealWhenShown";
import { revealOffset } from "./utils/revealOffset";

/**
 * Wraps screen content in the app's standard scaffold: a safe-area view on
 * the paper background and a keyboard-friendly scroll view with consistent
 * padding. Passing `onRefresh` enables pull-to-refresh. Errors raised by the
 * content surface through the toast layer this scaffold hosts (see
 * `useErrorToast`), pinned over the header and the scroll view alike. A
 * view inside can ask to be scrolled into sight (`useRevealWhenShown`).
 */
export function Screen({
  children,
  header,
  error = "",
  refreshing = false,
  onRefresh,
}: {
  /** The scrollable screen content. */
  children: ReactNode;
  /** Fixed chrome rendered above the scroll view (e.g. ScreenHeader). */
  header?: ReactNode;
  /** Action failure to show above the screen, including failures owned by its orchestrator. */
  error?: string;
  /** Whether the pull-to-refresh spinner is active. */
  refreshing?: boolean;
  /** Called on pull-to-refresh; omitting it disables the gesture. */
  onRefresh?: () => void;
}) {
  const { isTablet } = useResponsiveLayout();
  const scrollRef = useRef<ScrollViewInstance>(null);

  /**
   * Scrolls just far enough that `target` sits inside the visible part of
   * the scroll view. The view is measured within the content and on screen,
   * which together give how far the screen is scrolled now.
   *
   * @param target - A view inside this screen's content.
   */
  const reveal = useCallback((target: HostInstance) => {
    const scroll = scrollRef.current;
    const content = scroll?.getInnerViewRef();
    const frame = scroll?.getNativeScrollRef();
    if (!scroll || !content || !frame) return;
    target.measureLayout(content, (_left, contentTop, _width, height) => {
      target.measureInWindow((_windowLeft, windowTop) => {
        frame.measureInWindow((_frameLeft, frameTop, _frameWidth, viewportHeight) => {
          const offset = revealOffset({
            contentTop,
            visibleTop: windowTop - frameTop,
            height,
            viewportHeight,
            margin: spacing.lg,
          });
          if (offset !== null) scroll.scrollTo({ y: offset, animated: true });
        });
      });
    });
  }, []);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ToastProvider error={error}>
      {header}
      <ScrollView
        ref={scrollRef}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, isTablet ? styles.contentTablet : null]}
        keyboardDismissMode="interactive"
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
        <ScreenRevealContext value={reveal}>{children}</ScreenRevealContext>
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

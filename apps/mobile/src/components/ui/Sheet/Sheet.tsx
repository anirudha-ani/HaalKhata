/** Bottom-sheet dialog shell (the mobile counterpart of the web's Modal) with backdrop dismissal. */

import { X } from "lucide-react-native";
import type { ReactNode, RefObject } from "react";
import type { ScrollViewInstance } from "react-native";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/Text";
import { FeedbackPressable } from "@/components/ui/FeedbackPressable/FeedbackPressable";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { TABLET_SHEET_MAX_WIDTH } from "@/lib/layout/constants/layout";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { SHEET_MAX_HEIGHT_RATIO, SHEET_ORIENTATIONS } from "./constants/sheet";
import { useSheetEntrance } from "./hooks/useSheetEntrance";

/**
 * Renders a bottom sheet with a titled header, a close button, and
 * backdrop-tap dismissal. Content scrolls when taller than the sheet and the
 * sheet rises above the keyboard while editing.
 *
 * A `footer` stays pinned under the scrolling content. It is for a form
 * taller than the screen: an action that has scrolled out of reach looks
 * like a form with no way to finish it.
 *
 * The backdrop fades in while the card rises (or, on iPad, grows), rather
 * than the whole modal sliding up together with its dimming.
 *
 * Without `onClose` the sheet cannot be dismissed: no close button, the
 * backdrop ignores taps and the back gesture does nothing. That is for a
 * screen shown just before an iOS permission alert, which Apple asks to
 * lead only to the alert.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  scrollRef,
}: {
  /** Heading text, also used as the sheet's accessible label. */
  title: string;
  /**
   * Called when the user dismisses the sheet (close button, backdrop tap, or
   * back gesture). Leave it out for a sheet that may only end through its
   * own footer action.
   */
  onClose?: () => void;
  /** Sheet body content. */
  children: ReactNode;
  /** Content pinned to the bottom of the sheet while the body scrolls above it. */
  footer?: ReactNode;
  /**
   * Ref to the scrolling body, for a caller that needs to bring part of its
   * content into view, such as a form showing where its first problem is.
   */
  scrollRef?: RefObject<ScrollViewInstance | null>;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const { isTablet } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, isTablet ? spacing.xxl : 0);
  const bottomPadding = isTablet ? Math.max(insets.bottom, spacing.xxl) : 0;
  const entrance = useSheetEntrance(isTablet);
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose ?? (() => undefined)}
      supportedOrientations={SHEET_ORIENTATIONS}
      transparent
      visible
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          styles.backdropContainer,
          isTablet ? styles.backdropContainerTablet : null,
          {
            paddingTop: topPadding,
            paddingLeft: Math.max(insets.left, isTablet ? spacing.xxl : 0),
            paddingRight: Math.max(insets.right, isTablet ? spacing.xxl : 0),
          },
        ]}
      >
        {onClose ? (
          <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        ) : (
          <View style={styles.backdrop} />
        )}
        <Animated.View
          accessibilityLabel={title}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: Math.max(0, Math.min(windowHeight * SHEET_MAX_HEIGHT_RATIO, windowHeight - topPadding - bottomPadding)),
              paddingBottom: Math.max(insets.bottom, spacing.xxl),
            },
            isTablet ? styles.sheetTablet : null,
            entrance,
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {onClose ? (
              <FeedbackPressable
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={onClose}
                style={styles.closeButton}
              >
                <X color={colors.inkSoft} size={20} />
              </FeedbackPressable>
            ) : null}
          </View>
          <ScrollView
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(41, 34, 23, 0.4)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  backdropContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropContainerTablet: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  closeButton: {
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    flexShrink: 0,
  },
  footer: {
    flexShrink: 0,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.sm,
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    flexShrink: 1,
    padding: spacing.xl - 4,
    paddingBottom: spacing.xxl,
  },
  sheetTablet: {
    borderRadius: radii.lg,
    maxWidth: TABLET_SHEET_MAX_WIDTH,
    width: "100%",
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "600",
  },
});

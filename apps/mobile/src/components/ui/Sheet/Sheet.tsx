/** Bottom-sheet dialog shell (the mobile counterpart of the web's Modal) with backdrop dismissal. */

import { X } from "lucide-react-native";
import { Fragment, type ReactNode, type RefObject } from "react";
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
import { useFoldRegion } from "@/lib/fold/hooks/useFoldRegion";
import { CENTERED_SHEET_MAX_WIDTH } from "@/lib/layout/constants/layout";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { SHEET_MAX_HEIGHT_RATIO, SHEET_ORIENTATIONS } from "./constants/sheet";
import { useSheetEntrance } from "./hooks/useSheetEntrance";
import { useSheetViewport } from "./hooks/useSheetViewport";
import { clearOfFold } from "./utils/clearOfFold";

/**
 * Renders a bottom sheet with a titled header, a close button, and
 * backdrop-tap dismissal. Content scrolls when taller than the sheet and the
 * sheet rises above the keyboard while editing.
 *
 * A `footer` stays pinned under the scrolling content. It is for a form
 * taller than the screen: an action that has scrolled out of reach looks
 * like a form with no way to finish it. In a short viewport (including the
 * keyboard and larger text), the title and actions join the scroll instead
 * of squeezing the form to zero height. The form stays mounted throughout.
 *
 * In a large window (an iPad, iPhone Duo open) the sheet is a centred dialog.
 * A phone gets a bottom sheet held either way: held sideways it is wide but
 * too short for a centred card to keep its body in view once the keyboard is
 * up, while a bottom sheet leaves every point above the keyboard to it.
 * While a foldable stands half open, the sheet sits wholly on one side of the
 * fold, never across the crease (see `clearOfFold`).
 *
 * The backdrop fades in while the card rises (or, centred, grows), rather
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { isLargeWindow: centered, fontScale } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const clearance = clearOfFold({ width: windowWidth, height: windowHeight }, useFoldRegion(), insets, spacing.lg);
  const topPadding = Math.max(insets.top, centered ? spacing.xxl : 0, clearance.top);
  const bottomPadding = Math.max(centered ? Math.max(insets.bottom, spacing.xxl) : 0, clearance.bottom);
  const entrance = useSheetEntrance(centered);
  const viewport = useSheetViewport(windowHeight - topPadding - bottomPadding, fontScale);
  const heading = (
    <View key="heading" style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {onClose ? (
        <FeedbackPressable accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={styles.closeButton}>
          <X color={colors.inkSoft} size={20} />
        </FeedbackPressable>
      ) : null}
    </View>
  );
  const actions = footer ? <View key="actions" style={styles.footer}>{footer}</View> : null;
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
          centered ? styles.backdropContainerCentered : null,
          {
            paddingTop: topPadding,
            paddingLeft: Math.max(insets.left, centered ? spacing.xxl : 0, clearance.left),
            paddingRight: Math.max(insets.right, centered ? spacing.xxl : 0, clearance.right),
          },
        ]}
      >
        {onClose ? (
          <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        ) : (
          <View style={styles.backdrop} />
        )}
        <View
          onLayout={viewport.onLayout}
          style={[
            styles.viewport,
            centered ? styles.viewportCentered : null,
            // The keyboard owns the container's bottom padding, so room kept below for a fold is a margin.
            clearance.bottom > 0 ? { marginBottom: clearance.bottom } : null,
          ]}
        >
          <Animated.View
            accessibilityLabel={title}
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                maxHeight: Math.max(0, Math.min(windowHeight * SHEET_MAX_HEIGHT_RATIO, windowHeight - topPadding - bottomPadding)),
                paddingBottom: Math.max(insets.bottom, spacing.xxl),
              },
              centered ? styles.sheetCentered : null,
              entrance,
            ]}
          >
            {viewport.scrollChrome ? null : heading}
            <ScrollView
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
            >
              {viewport.scrollChrome ? heading : null}
              <Fragment key="body">{children}</Fragment>
              {viewport.scrollChrome ? actions : null}
            </ScrollView>
            {viewport.scrollChrome ? null : actions}
          </Animated.View>
        </View>
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
  backdropContainerCentered: {
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
  sheetCentered: {
    borderRadius: radii.lg,
    maxWidth: CENTERED_SHEET_MAX_WIDTH,
    width: "100%",
  },
  // The measured space in front of the backdrop. Touches outside the card pass
  // through it to the backdrop behind, which closes the sheet.
  viewport: { flex: 1, justifyContent: "flex-end", pointerEvents: "box-none", width: "100%" },
  viewportCentered: { alignItems: "center", justifyContent: "center" },
  title: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "600",
  },
});

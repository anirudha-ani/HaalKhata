/** Bottom-sheet dialog shell (the mobile counterpart of the web's Modal) with backdrop dismissal. */

import { X } from "lucide-react-native";
import type { ReactNode, RefObject } from "react";
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
import { Text } from "@/components/ui/Text";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { TABLET_SHEET_MAX_WIDTH } from "@/lib/layout/constants/layout";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { SHEET_MAX_HEIGHT_RATIO, SHEET_ORIENTATIONS } from "./constants/sheet";

/**
 * Renders a bottom sheet with a titled header, a close button, and
 * backdrop-tap dismissal. Content scrolls when taller than the sheet and the
 * sheet rises above the keyboard while editing.
 *
 * A `footer` stays pinned under the scrolling content. It is for a form
 * taller than the screen: an action that has scrolled out of reach looks
 * like a form with no way to finish it.
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
  /** Called when the user dismisses the sheet (close button, backdrop tap, or back gesture). */
  onClose: () => void;
  /** Sheet body content. */
  children: ReactNode;
  /** Content pinned to the bottom of the sheet while the body scrolls above it. */
  footer?: ReactNode;
  /**
   * Ref to the scrolling body, for a caller that needs to bring part of its
   * content into view, such as a form showing where its first problem is.
   */
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const { isTablet } = useResponsiveLayout();
  return (
    <Modal animationType={isTablet ? "fade" : "slide"} onRequestClose={onClose} supportedOrientations={SHEET_ORIENTATIONS} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.backdropContainer, isTablet ? styles.backdropContainerTablet : null]}
      >
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        <View
          accessibilityLabel={title}
          style={[
            styles.sheet,
            { maxHeight: Math.max(0, Math.min(windowHeight * SHEET_MAX_HEIGHT_RATIO, windowHeight - (isTablet ? spacing.xxl * 2 : 0))) },
            isTablet ? styles.sheetTablet : null,
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}
            >
              <X color={colors.inkSoft} size={20} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
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
  backdropContainerTablet: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  closeButton: {
    borderRadius: radii.full,
    padding: 6,
  },
  footer: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
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
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "600",
  },
});

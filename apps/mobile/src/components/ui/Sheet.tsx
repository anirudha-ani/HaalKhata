/** Bottom-sheet dialog shell (the mobile counterpart of the web's Modal) with backdrop dismissal. */

import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { TABLET_SHEET_MAX_WIDTH } from "@/components/shell/shell.constants";
import { useResponsiveLayout } from "@/components/shell/hooks/useResponsiveLayout";
import { SHEET_MAX_HEIGHT_RATIO } from "./ui.constants";

/**
 * Renders a bottom sheet with a titled header, a close button, and
 * backdrop-tap dismissal. Content scrolls when taller than the sheet and the
 * sheet rises above the keyboard while editing.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  /** Heading text, also used as the sheet's accessible label. */
  title: string;
  /** Called when the user dismisses the sheet (close button, backdrop tap, or back gesture). */
  onClose: () => void;
  /** Sheet body content. */
  children: ReactNode;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const { isTablet } = useResponsiveLayout();
  return (
    <Modal animationType={isTablet ? "fade" : "slide"} onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.backdropContainer, isTablet ? styles.backdropContainerTablet : null]}
      >
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        <View
          accessibilityLabel={title}
          style={[
            styles.sheet,
            { maxHeight: windowHeight * SHEET_MAX_HEIGHT_RATIO },
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
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
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

/** Overflow menu: a "more" button for a screen header that drops a short list of screen-level actions. */

import { EllipsisVertical } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { SHEET_ORIENTATIONS } from "@/components/ui/Sheet/constants/sheet";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import {
  OVERFLOW_MENU_EDGE_INSET,
  OVERFLOW_MENU_GAP,
  OVERFLOW_MENU_WIDTH,
} from "./constants/overflowMenu";

/** One action in an overflow menu. */
export interface OverflowMenuItem {
  /** The words on the row; also its key, so labels must be unique within a menu. */
  label: string;
  /** Leading icon, sized by the caller (18 points reads well). */
  icon: ReactNode;
  /** Runs once the menu has gone, so it may open a sheet of its own. */
  onSelect: () => void;
  /** Dims the row and ignores presses, e.g. while its action is already in flight. */
  disabled?: boolean;
}

/**
 * Renders a "more" button — three vertical dots, bare like the back chevron
 * it shares the header with — that drops a menu of actions under it,
 * aligned to its right edge, over a backdrop that closes it when tapped.
 *
 * Most actions open a sheet, and iOS cannot present one modal while another
 * is still animating away — the sheet would silently fail to appear. So on
 * iOS a chosen action waits for the menu's `onDismiss`; Android has no such
 * limit (and no `onDismiss`), so it runs straight away there.
 *
 * @param props - Component props.
 * @returns The button and, while open, its menu.
 */
export function OverflowMenu({
  label,
  items,
}: {
  /** Accessible name of the button, e.g. "Group options". */
  label: string;
  /** The actions, in display order. */
  items: OverflowMenuItem[];
}) {
  const triggerRef = useRef<View>(null);
  const chosenRef = useRef<(() => void) | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const { width: windowWidth } = useWindowDimensions();

  /** Measures the button where it sits on screen and opens the menu under it. */
  const open = () => {
    triggerRef.current?.measureInWindow((left, buttonTop, width, height) => {
      setAnchor({
        top: buttonTop + height + OVERFLOW_MENU_GAP,
        right: Math.max(OVERFLOW_MENU_EDGE_INSET, windowWidth - left - width),
      });
    });
  };

  /** Runs the chosen action, once: whichever of the two paths reaches it first takes it. */
  const runChosen = () => {
    const action = chosenRef.current;
    chosenRef.current = null;
    action?.();
  };

  /**
   * Closes the menu and runs the item's action when the platform is ready
   * for whatever it opens.
   *
   * @param item - The action that was pressed.
   */
  const choose = (item: OverflowMenuItem) => {
    chosenRef.current = item.onSelect;
    setAnchor(null);
    if (Platform.OS !== "ios") runChosen();
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded: anchor !== null }}
        hitSlop={8}
        onPress={open}
        style={({ pressed }) => [styles.trigger, pressed || anchor ? styles.triggerActive : null]}
      >
        <EllipsisVertical color={anchor ? colors.brand600 : colors.ink} size={22} />
      </Pressable>
      <Modal
        animationType="fade"
        onDismiss={runChosen}
        onRequestClose={() => setAnchor(null)}
        statusBarTranslucent
        supportedOrientations={SHEET_ORIENTATIONS}
        transparent
        visible={anchor !== null}
      >
        <Pressable accessibilityLabel="Close menu" onPress={() => setAnchor(null)} style={styles.backdrop} />
        {anchor ? (
          // The shadow and the clipping are two views: iOS draws no shadow
          // outside a view that clips its children to its rounded corners.
          <View style={[styles.menuShadow, { right: anchor.right, top: anchor.top }]}>
            <View accessibilityLabel={label} accessibilityRole="menu" style={styles.menu}>
              {items.map((item, index) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="menuitem"
                  accessibilityState={{ disabled: item.disabled === true }}
                  disabled={item.disabled}
                  onPress={() => choose(item)}
                  style={({ pressed }) => [
                    styles.item,
                    index > 0 ? styles.itemDivider : null,
                    pressed ? styles.itemPressed : null,
                    item.disabled ? styles.itemDisabled : null,
                  ]}
                >
                  {item.icon}
                  <Text style={styles.itemLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  item: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  itemDisabled: {
    opacity: 0.5,
  },
  itemDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  itemLabel: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  itemPressed: {
    backgroundColor: colors.paper,
  },
  menu: {
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  menuShadow: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    elevation: 8,
    position: "absolute",
    shadowColor: colors.ink,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    width: OVERFLOW_MENU_WIDTH,
  },
  trigger: {
    alignItems: "center",
    borderRadius: radii.full,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  triggerActive: {
    backgroundColor: colors.paper,
  },
});

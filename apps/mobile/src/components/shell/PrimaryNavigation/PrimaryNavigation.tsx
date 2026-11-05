/** Responsive primary navigation: bottom tabs on a phone and a rail in a large window. */

import { Tabs, useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { I18nManager, StyleSheet, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddExpenseTabButton } from "@/components/shell/PrimaryNavigation/components/AddExpenseTabButton/AddExpenseTabButton";
import {
  ADD_TAB_ITEM,
  LEFT_TAB_ITEMS,
  RIGHT_TAB_ITEMS,
  type TabItem,
} from "@/components/shell/PrimaryNavigation/constants/navigation";
import { navigationInsets } from "@/components/shell/PrimaryNavigation/utils/navigationInsets";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { FADE_DURATION_MS } from "@/lib/motion/motion.constants";
import { useShellData } from "@/lib/hooks/useShellData";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Builds the tabBarIcon render function for a lucide icon.
 *
 * @param Icon - The lucide icon component for the tab.
 * @returns A render function compatible with the Tabs `tabBarIcon` option.
 */
function tabIcon(Icon: LucideIcon) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon color={color as string} size={22} />;
  };
}

/**
 * Renders one ordinary tab declaration.
 *
 * @param item - The tab's route name, label, and icon.
 * @param badge - A count to pin to the icon; 0 shows no badge.
 * @returns The Tabs.Screen element for that destination.
 */
function tabScreen(item: TabItem, badge = 0) {
  return (
    <Tabs.Screen
      key={item.name}
      name={item.name}
      options={{
        tabBarBadge: badge > 0 ? badge : undefined,
        tabBarBadgeStyle: styles.badge,
        tabBarIcon: tabIcon(item.icon),
        title: item.label,
      }}
    />
  );
}

/**
 * Layout for authenticated primary navigation. A phone, held either way, uses
 * the familiar bottom bar with a raised add button; a large window (an iPad,
 * iPhone Duo open) uses a persistent rail on the leading side with the same
 * destinations and a conventional add item.
 *
 * Each side of the bar keeps clear of its own safe-area inset rather than
 * both sides of the larger one (see `navigationInsets`), so iPhone Duo's
 * status bar down the right edge neither squeezes the tabs nor covers the
 * rail, left to right or right to left.
 *
 * @returns The bottom-tab navigator.
 */
export function PrimaryNavigation() {
  const router = useRouter();
  const { isLargeWindow } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { navigatorInsets, barStyle } = navigationInsets(insets, isLargeWindow, I18nManager.isRTL);
  // Friend requests waiting for an answer sit on the Friends tab, the way
  // unread notifications sit on the bell.
  const { pendingFriendRequestCount } = useShellData();
  return (
    <Tabs
      safeAreaInsets={navigatorInsets}
      screenOptions={{
        animation: "fade",
        transitionSpec: { animation: "timing", config: { duration: FADE_DURATION_MS } },
        headerShown: false,
        sceneStyle: { backgroundColor: colors.paper },
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarItemStyle: isLargeWindow ? styles.railItem : undefined,
        tabBarLabelPosition: "below-icon",
        tabBarLabelStyle: isLargeWindow ? styles.railLabel : styles.bottomLabel,
        tabBarPosition: isLargeWindow ? "left" : "bottom",
        tabBarStyle: [isLargeWindow ? styles.rail : styles.bottomBar, barStyle],
        tabBarVariant: isLargeWindow ? "material" : "uikit",
      }}
    >
      {LEFT_TAB_ITEMS.map((item) => tabScreen(item))}
      <Tabs.Screen
        name="add"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push("/expenses/new");
          },
        }}
        options={
          isLargeWindow
            ?{ tabBarIcon: tabIcon(ADD_TAB_ITEM.icon), title: ADD_TAB_ITEM.label }
            : { tabBarButton: AddExpenseTabButton, title: ADD_TAB_ITEM.label }
        }
      />
      {RIGHT_TAB_ITEMS.map((item) =>
        tabScreen(item, item.name === "friends" ? pendingFriendRequestCount : 0),
      )}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.brand600,
    color: colors.white,
    fontSize: 10,
    fontWeight: "700",
  },
  bottomBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.line,
  },
  bottomLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  rail: {
    backgroundColor: colors.card,
    // The content side: the right of a rail on the left, the left of one on the right.
    borderEndColor: colors.line,
    borderEndWidth: 1,
    paddingVertical: spacing.xl - spacing.xs,
  },
  railItem: {
    borderRadius: radii.md,
    marginHorizontal: 0,
    marginVertical: spacing.xs,
  },
  railLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
});

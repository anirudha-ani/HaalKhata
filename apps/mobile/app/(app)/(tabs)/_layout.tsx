/** Responsive primary navigation: bottom tabs on phones and a rail on tablets. */

import { Tabs, useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, type ColorValue } from "react-native";
import { AddExpenseTabButton } from "@/components/shell/AddExpenseTabButton";
import {
  ADD_TAB_ITEM,
  LEFT_TAB_ITEMS,
  RIGHT_TAB_ITEMS,
  TABLET_NAVIGATION_WIDTH,
  type TabItem,
} from "@/components/shell/shell.constants";
import { useResponsiveLayout } from "@/components/shell/hooks/useResponsiveLayout";
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
 * @returns The Tabs.Screen element for that destination.
 */
function tabScreen(item: TabItem) {
  return (
    <Tabs.Screen
      key={item.name}
      name={item.name}
      options={{ tabBarIcon: tabIcon(item.icon), title: item.label }}
    />
  );
}

/**
 * Layout for authenticated primary navigation. Phones use the familiar
 * bottom bar with a raised add button; tablets use a persistent left rail
 * with the same destinations and a conventional add item.
 *
 * @returns The bottom-tab navigator.
 */
export default function TabsLayout() {
  const router = useRouter();
  const { isTablet } = useResponsiveLayout();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.paper },
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarItemStyle: isTablet ? styles.railItem : undefined,
        tabBarLabelPosition: "below-icon",
        tabBarLabelStyle: isTablet ? styles.railLabel : styles.bottomLabel,
        tabBarPosition: isTablet ? "left" : "bottom",
        tabBarStyle: isTablet ? styles.rail : styles.bottomBar,
        tabBarVariant: isTablet ? "material" : "uikit",
      }}
    >
      {LEFT_TAB_ITEMS.map(tabScreen)}
      <Tabs.Screen
        name="add"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push("/expenses/new");
          },
        }}
        options={
          isTablet
            ? { tabBarIcon: tabIcon(ADD_TAB_ITEM.icon), title: ADD_TAB_ITEM.label }
            : { tabBarButton: AddExpenseTabButton, title: ADD_TAB_ITEM.label }
        }
      />
      {RIGHT_TAB_ITEMS.map(tabScreen)}
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
    borderRightColor: colors.line,
    borderRightWidth: 1,
    paddingVertical: spacing.xl - spacing.xs,
    width: TABLET_NAVIGATION_WIDTH,
  },
  railItem: {
    borderRadius: radii.md,
    marginHorizontal: spacing.md - 2,
    marginVertical: spacing.xs,
  },
  railLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
});

/** Bottom-tab layout: the main destinations around the floating add-expense button. */

import { Tabs } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import type { ColorValue } from "react-native";
import { AddExpenseTabButton } from "@/components/shell/AddExpenseTabButton";
import { LEFT_TAB_ITEMS, RIGHT_TAB_ITEMS, type TabItem } from "@/components/shell/shell.constants";
import { colors } from "@/lib/theme/theme";

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
 * Layout for the authed tab bar, mirroring the web's mobile bottom nav:
 * Home and Groups on the left, the raised add-expense button in the middle,
 * Scan and Friends on the right. Activity is reached via the header bell.
 *
 * @returns The bottom-tab navigator.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.paper },
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
      }}
    >
      {LEFT_TAB_ITEMS.map(tabScreen)}
      <Tabs.Screen
        name="add"
        options={{ tabBarButton: AddExpenseTabButton, title: "Add" }}
      />
      {RIGHT_TAB_ITEMS.map(tabScreen)}
    </Tabs>
  );
}

/** Root layout: app-wide providers, status bar, and the navigation stack. */

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Providers } from "@/components/providers/Providers";
import { colors } from "@/lib/theme/theme";

/**
 * Root layout for every route: wraps the app in the TanStack Query provider
 * (with cache persistence and session hydration) and renders the navigation
 * stack on the paper background.
 *
 * @returns The provider-wrapped root navigator.
 */
export default function RootLayout() {
  return (
    <Providers>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.paper },
          headerShown: false,
        }}
      />
    </Providers>
  );
}

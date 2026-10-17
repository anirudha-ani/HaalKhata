/** Root layout: app-wide providers, status bar, and the navigation stack. */

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Providers } from "@/components/providers/Providers";
import { colors } from "@/lib/theme/theme";

/**
 * Root layout for every route: wraps the app in the TanStack Query provider
 * (with in-memory caching and session hydration) and renders the navigation
 * stack on the paper background.
 *
 * Moves between the root routes (launch, welcome, onboarding, the signed-in
 * app) are changes of context rather than steps deeper into one, so they
 * cross-fade instead of sliding in from the side. Pushes inside the signed-in
 * app keep the native slide; that stack sets its own options.
 *
 * @returns The provider-wrapped root navigator.
 */
export default function RootLayout() {
  return (
    <Providers>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          animation: "fade",
          contentStyle: { backgroundColor: colors.paper },
          headerShown: false,
        }}
      />
    </Providers>
  );
}

/** Root layout: hosts the navigation stack. */

import { Stack } from "expo-router";

/**
 * Root layout for every route: renders the navigation stack.
 *
 * @returns The app's root navigator.
 */
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

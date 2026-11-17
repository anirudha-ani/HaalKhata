/** Native pushed-screen header, including system Back and interactive pop gestures. */

import { Stack, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { colors } from "@/lib/theme/theme";
import { DetailTitle } from "../DetailTitle/DetailTitle";

/**
 * Lets UIKit place Back and actions while preserving each screen's title and context.
 * @param props - The same title, identity and actions as the existing detail header.
 * @returns Native navigation configuration for Duo only.
 */
export function DuoDetailHeader({ title, subtitle, leading, right }: {
  /** Screen name. */
  title: string;
  /** Secondary context for the screen. */
  subtitle?: string;
  /** Person or group image. */
  leading?: ReactNode;
  /** Screen-specific action. */
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{
        title,
        headerShown: true,
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.card },
        headerBackButtonDisplayMode: "minimal",
        gestureEnabled: true,
        headerTitle: () => <DetailTitle title={title} subtitle={subtitle} leading={leading} />,
        headerRight: right ? () => right : undefined,
      }} />
      {!router.canGoBack() ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon="chevron.left" accessibilityLabel="Back to Home" onPress={() => router.replace("/dashboard")} />
        </Stack.Toolbar>
      ) : null}
    </>
  );
}

/** Authenticated area layout: redirects signed-out users to /login and hosts the authed stack. */

import { Redirect, Stack } from "expo-router";
import { Spinner } from "@/components/ui/Spinner";
import { useSession } from "@/lib/api/session";
import { colors } from "@/lib/theme/theme";

/**
 * Layout for every authenticated route: waits for session hydration,
 * redirects to /login when there is no session (including after the
 * transport clears a revoked token), and otherwise hosts the stack of tab
 * and detail screens.
 *
 * @returns The authed navigation stack for signed-in users.
 */
export default function AppLayout() {
  const session = useSession();
  if (!session.hydrated) return <Spinner />;
  if (!session.token) return <Redirect href="/login" />;
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.paper },
        headerShown: false,
      }}
    />
  );
}

/** Authenticated area layout: redirects signed-out and not-yet-onboarded users, hosts the authed stack. */

import { useQuery } from "@tanstack/react-query";
import { Redirect, Stack } from "expo-router";
import { Spinner } from "@/components/ui/Spinner";
import { authClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { useSession } from "@/lib/api/session";
import { colors } from "@/lib/theme/theme";

/**
 * Layout for every authenticated route: waits for session hydration,
 * redirects to /login when there is no session (including after the
 * transport clears a revoked token), sends a signed-in user who has not
 * finished first-run to /onboarding, and otherwise hosts the stack of tab
 * and detail screens.
 *
 * @returns The authed navigation stack for signed-in users.
 */
export default function AppLayout() {
  const session = useSession();
  return session.hydrated ? (
    session.token ? (
      <OnboardingGate />
    ) : (
      <Redirect href="/login" />
    )
  ) : (
    <Spinner />
  );
}

/**
 * Holds the stack back until the profile has loaded once, and sends anyone
 * who has not completed onboarding to it. /onboarding lives outside this
 * group precisely so the redirect cannot loop; `onboarded` is stamped even
 * when every field is skipped, so nobody is sent there twice. A profile
 * that cannot be fetched (offline) does not block the app — the cached
 * screens are still worth more than a spinner.
 *
 * @returns The authed stack, a redirect to onboarding, or a spinner.
 */
function OnboardingGate() {
  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  if (currentUser.isPending) return <Spinner />;
  if (currentUser.data && !currentUser.data.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.paper },
        headerShown: false,
      }}
    />
  );
}

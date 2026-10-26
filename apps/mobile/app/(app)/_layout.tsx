/** Authenticated area layout: redirects signed-out and not-yet-onboarded users, hosts the authed stack. */

import { useQuery } from "@tanstack/react-query";
import { Redirect, Stack, usePathname } from "expo-router";
import { PushHost } from "@/components/push/PushHost/PushHost";
import { Spinner } from "@/components/ui/Spinner";
import { authClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { useSession } from "@/lib/api/session";
import { useDeviceSetupGate } from "@/lib/onboarding/hooks/useDeviceSetupGate";
import { colors } from "@/lib/theme/theme";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";

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
 * Holds the stack back until the profile has loaded once, and sends to the
 * first-run flow anyone who has not completed onboarding, or who has just
 * signed in on this phone and has not been through its device steps (find
 * friends, notifications) here yet. /onboarding lives outside this group
 * precisely so the redirect cannot loop; `onboarded` is stamped even when
 * every field is skipped, and the device steps are marked done on this
 * phone, so nobody is sent there twice. The screen the person was headed
 * for rides along as `next` and opens when the flow ends. A profile that
 * cannot be fetched (offline) does not block the app — the cached screens
 * are still worth more than a spinner.
 *
 * @returns The authed stack, a redirect to onboarding, or a spinner.
 */
function OnboardingGate() {
  const reduceMotion = useReduceMotion();
  const pathname = usePathname();
  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const deviceSetup = useDeviceSetupGate(currentUser.data);
  if (currentUser.isPending || deviceSetup.checking) return <Spinner />;
  if (currentUser.data && (!currentUser.data.onboarded || deviceSetup.due)) {
    return <Redirect href={{ pathname: "/onboarding", params: { next: pathname } }} />;
  }
  return (
    <>
      <Stack
        screenOptions={{
          animation: reduceMotion ? "fade" : "default",
          contentStyle: { backgroundColor: colors.paper },
          headerShown: false,
        }}
      />
      <PushHost signedInUserId={currentUser.data?.id} />
    </>
  );
}

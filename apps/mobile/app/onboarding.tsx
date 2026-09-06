/** /onboarding route: first-run profile flow, outside the (app) stack. */

import { Redirect } from "expo-router";
import { Spinner } from "@/components/ui/Spinner";
import { useSession } from "@/lib/api/session";
import { OnboardingScreen } from "@/screens/onboarding/components/OnboardingScreen/OnboardingScreen";

/**
 * Renders the first-run flow. It sits outside the `(app)` group deliberately:
 * that layout redirects here while onboarding is incomplete, so living inside
 * it would be a redirect loop.
 *
 * @returns The onboarding screen for a signed-in user, or a redirect to login.
 */
export default function Onboarding() {
  const session = useSession();
  if (!session.hydrated) return <Spinner />;
  if (!session.token) return <Redirect href="/login" />;
  return <OnboardingScreen />;
}

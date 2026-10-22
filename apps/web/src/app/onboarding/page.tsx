/** /onboarding route: first-run profile flow, outside the (app) shell. */

import { redirect } from "next/navigation";
import { sessionUser } from "@/lib/auth/session.server";
import { OnboardingPage } from "./components/OnboardingPage/OnboardingPage";

/**
 * Renders the first-run flow. It sits outside the `(app)` group deliberately:
 * that layout redirects here while onboarding is incomplete, so living inside
 * it would be a redirect loop. Completed accounts go straight to the app,
 * including when an old tab or history entry opens this route again.
 *
 * @returns The /onboarding page for a signed-in user.
 */
export default async function Onboarding() {
  const user = await sessionUser();
  if (!user) redirect("/login");
  if (user.onboarded) redirect("/dashboard");
  return <OnboardingPage />;
}

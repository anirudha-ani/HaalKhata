/** /onboarding route: first-run profile flow, outside the (app) shell. */

import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/auth/session.server";
import { OnboardingPage } from "./components/OnboardingPage/OnboardingPage";

/**
 * Renders the first-run flow. It sits outside the `(app)` group deliberately:
 * that layout redirects here while onboarding is incomplete, so living inside
 * it would be a redirect loop.
 *
 * @returns The /onboarding page for a signed-in user.
 */
export default async function Onboarding() {
  if (!(await sessionUserId())) redirect("/login");
  return <OnboardingPage />;
}

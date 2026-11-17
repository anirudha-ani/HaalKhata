/** Public policy route; processor disclosures must reflect the running server configuration. */

import { PrivacyPage } from "./components/PrivacyPage/PrivacyPage";

/** Privacy page title shown by browsers and search results. */
export const metadata = { title: "Privacy policy" };

/** Do not freeze processor names from the build environment into the public policy. */
export const dynamic = "force-dynamic";

/** @returns The current public privacy policy, accessible without signing in. */
export default function Page() {
  return <PrivacyPage />;
}

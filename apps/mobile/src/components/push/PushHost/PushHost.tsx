/** Mounts push handling for the signed-in app: registration, tap routing, the icon badge and the explainer. */

import { PushPrompt } from "@/components/push/PushPrompt/PushPrompt";
import { useBadgeSync } from "@/lib/push/hooks/useBadgeSync";
import { usePushRegistration } from "@/lib/push/hooks/usePushRegistration";
import { usePushResponses } from "@/lib/push/hooks/usePushResponses";

/**
 * @param props - Who is signed in, once the profile has loaded.
 * @returns The explainer sheet when it is open; otherwise nothing visible.
 */
export function PushHost({ signedInUserId }: { signedInUserId: string | undefined }) {
  usePushRegistration();
  usePushResponses(signedInUserId);
  useBadgeSync();
  return <PushPrompt />;
}

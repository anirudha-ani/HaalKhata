/** State behind the one-time "friends can find you" card. */

import { useState } from "react";
import { CONTACT_DISCOVERY_PROMPT } from "@haalkhata/shared/contacts/contactsCopy";
import { needsDiscoveryAnswer, type ContactDiscovery } from "@haalkhata/shared/contacts/discovery";
import { errorMessage } from "@/lib/api/connect";
import { useContactDiscoveryAPI } from "@/lib/hooks/useContactDiscoveryAPI";

/**
 * Records the person's answer from the card. Once answered, the stored
 * answer stops asking, but the card stays long enough to say what was saved
 * and where to change it — a card that simply vanished would leave the
 * person unsure anything happened.
 *
 * @param answer - The caller's stored answer.
 * @returns Whether to show the card, whether it is still asking, the busy
 *   flag, the last error and notice, and `respond` to save yes or no.
 */
export function useContactDiscoveryPrompt(answer: ContactDiscovery) {
  const { setDiscoverable } = useContactDiscoveryAPI();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /** Saves the answer, then confirms it or shows why it failed. */
  const respond = async (discoverable: boolean) => {
    setError("");
    try {
      await setDiscoverable.mutateAsync(discoverable);
      setNotice(
        discoverable ? CONTACT_DISCOVERY_PROMPT.allowedNotice : CONTACT_DISCOVERY_PROMPT.declinedNotice,
      );
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return {
    visible: needsDiscoveryAnswer(answer) || notice !== "",
    asking: needsDiscoveryAnswer(answer),
    busy: setDiscoverable.isPending,
    error,
    notice,
    respond,
  };
}

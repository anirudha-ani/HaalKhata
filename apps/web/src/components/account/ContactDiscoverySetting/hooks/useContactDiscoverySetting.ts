"use client";
/** State behind the Account discoverability switch: saving, and what happened. */

import { useState } from "react";
import { CONTACT_DISCOVERY_SETTING } from "@haalkhata/shared/contacts/contactsCopy";
import { isDiscoverable, type ContactDiscovery } from "@haalkhata/shared/contacts/discovery";
import { errorMessage } from "@/lib/api/connect";
import { useContactDiscoveryAPI } from "@/lib/hooks/useContactDiscoveryAPI";

/**
 * Saves each flip of the switch at once and says what it did. A failed save
 * leaves the switch where the server has it and shows why beside it.
 *
 * @param answer - The caller's stored answer.
 * @returns The switch position, the busy flag, the last error and notice,
 *   and `change` to save a new position.
 */
export function useContactDiscoverySetting(answer: ContactDiscovery) {
  const { setDiscoverable } = useContactDiscoveryAPI();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /** Saves the new position, then confirms it or shows why it failed. */
  const change = async (discoverable: boolean) => {
    setError("");
    setNotice("");
    try {
      await setDiscoverable.mutateAsync(discoverable);
      setNotice(
        discoverable ? CONTACT_DISCOVERY_SETTING.findableNotice : CONTACT_DISCOVERY_SETTING.hiddenNotice,
      );
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return { checked: isDiscoverable(answer), busy: setDiscoverable.isPending, error, notice, change };
}

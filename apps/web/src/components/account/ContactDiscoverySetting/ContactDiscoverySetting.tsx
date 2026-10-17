"use client";
/** Account privacy setting: whether people can find you from their contacts. */

import { CONTACT_DISCOVERY_SETTING } from "@haalkhata/shared/contacts/contactsCopy";
import type { ContactDiscovery } from "@haalkhata/shared/contacts/discovery";
import { ContactDiscoveryToggle } from "@/components/account/ContactDiscoveryToggle/ContactDiscoveryToggle";
import { useContactDiscoverySetting } from "./hooks/useContactDiscoverySetting";

/**
 * Renders the switch, saved on every flip, with its outcome beneath it.
 *
 * @param props - Component props.
 * @returns The setting.
 */
export function ContactDiscoverySetting({
  answer,
}: {
  /** The caller's stored answer. */
  answer: ContactDiscovery;
}) {
  const setting = useContactDiscoverySetting(answer);
  return (
    <section className="space-y-2" aria-label={CONTACT_DISCOVERY_SETTING.label}>
      <ContactDiscoveryToggle
        checked={setting.checked}
        disabled={setting.busy}
        onChange={(discoverable) => void setting.change(discoverable)}
      />
      {setting.error ? <p role="alert" className="text-sm text-neg-700">{setting.error}</p> : null}
      {setting.notice ? <p role="status" className="text-sm text-pos-700">{setting.notice}</p> : null}
    </section>
  );
}

/** Maps what expo-contacts returns onto the shared address-book shape. */

import type { AddressBookContact } from "@haalkhata/shared/contacts/identifiers";

/** The subset of expo-contacts details this screen asks for. */
export interface DeviceContactDetails {
  /** The device's contact id. */
  id: string;
  /** Name as saved; null when the contact has none. */
  fullName?: string | null;
  /** Saved numbers; each may lack a number. */
  phones?: { number?: string }[];
  /** Saved emails; each may lack an address. */
  emails?: { address?: string }[];
}

/**
 * Reduces one device contact to what matching reads: its name, numbers and
 * email addresses, empty entries dropped.
 *
 * @param details - One contact as expo-contacts returned it.
 * @returns The shared address-book entry.
 */
export function toAddressBookContact(details: DeviceContactDetails): AddressBookContact {
  return {
    id: details.id,
    name: details.fullName?.trim() ?? "",
    phones: (details.phones ?? []).flatMap((phone) => (phone.number ? [{ number: phone.number }] : [])),
    emails: (details.emails ?? []).flatMap((email) => (email.address ? [email.address] : [])),
  };
}

/** The device's contacts permission and the reads it allows, for the Find friends screen. */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact, getPermissionsAsync, requestPermissionsAsync } from "expo-contacts";
import { useState } from "react";
import { Linking } from "react-native";
import type { AddressBookContact } from "@haalkhata/shared/contacts/identifiers";
import { errorMessage } from "@/lib/api/connect";
import {
  CONTACT_FIELDS,
  CONTACTS_PAGE_SIZE,
  CONTACTS_PERMISSION_QUERY_KEY,
} from "../../../constants/findFriends";
import { toAddressBookContact } from "../../../utils/addressBook";
import { contactsAccessOf, type ContactsAccess } from "../../../utils/contactsAccess";

/**
 * Reads and asks for contacts access, and reads the address book once it is
 * allowed. The permission is re-read whenever the app returns to the
 * foreground (the app's focus manager), so a change made in Settings shows
 * up without leaving the screen.
 *
 * Nothing here keeps a copy of the address book: `readAll` hands it to the
 * caller, which builds its lookup and lets the rest go.
 *
 * @returns The current access (undefined while first checked), the last
 *   error, and the actions: `request` (the OS prompt), `openSettings`,
 *   `chooseMore` (iOS 18's picker for limited access) and `readAll`.
 */
export function useContactsAccess() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const permission = useQuery({
    queryKey: CONTACTS_PERMISSION_QUERY_KEY,
    queryFn: async (): Promise<ContactsAccess> => contactsAccessOf(await getPermissionsAsync()),
    staleTime: 0,
    retry: false,
  });

  /**
   * Shows the operating system's prompt, after the screen's own explanation.
   *
   * @returns The resulting access, or null when the prompt could not be shown.
   */
  const request = async (): Promise<ContactsAccess | null> => {
    setError("");
    try {
      const access = contactsAccessOf(await requestPermissionsAsync());
      queryClient.setQueryData(CONTACTS_PERMISSION_QUERY_KEY, access);
      return access;
    } catch (failure) {
      setError(errorMessage(failure));
      return null;
    }
  };

  /** Opens this app's page in Settings, the only way back from a permanent refusal. */
  const openSettings = async () => {
    setError("");
    try {
      await Linking.openSettings();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  /**
   * Opens iOS 18's picker for adding contacts to a limited grant.
   *
   * @returns True when the picker closed normally, so the screen can read again.
   */
  const chooseMore = async (): Promise<boolean> => {
    setError("");
    try {
      await Contact.presentAccessPicker();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    }
  };

  /**
   * Reads every contact the grant covers, a page at a time, keeping only
   * names, numbers and emails.
   *
   * @returns The address book in the shared shape.
   */
  const readAll = async (): Promise<AddressBookContact[]> => {
    const contacts: AddressBookContact[] = [];
    for (let offset = 0; ; offset += CONTACTS_PAGE_SIZE) {
      const page = await Contact.getAllDetails(CONTACT_FIELDS, { limit: CONTACTS_PAGE_SIZE, offset });
      contacts.push(...page.map(toAddressBookContact));
      if (page.length < CONTACTS_PAGE_SIZE) return contacts;
    }
  };

  return {
    access: permission.data,
    checking: permission.isPending,
    error: error || (permission.error ? errorMessage(permission.error) : ""),
    request,
    openSettings,
    chooseMore,
    readAll,
  };
}

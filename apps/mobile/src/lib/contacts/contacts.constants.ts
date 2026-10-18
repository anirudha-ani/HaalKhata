/** Constants for reading the address book, shared by Find friends and the onboarding friends step. */

import { ContactField } from "expo-contacts";

/** Contacts read from the device per page; a large address book is read in several. */
export const CONTACTS_PAGE_SIZE = 500;

/**
 * The only fields read from each contact. Photos, notes, addresses and the
 * rest are never requested, so they never enter the app's memory.
 */
export const CONTACT_FIELDS = [
  ContactField.FULL_NAME,
  ContactField.PHONES,
  ContactField.EMAILS,
] as const;

/** Query key for the device's contacts permission; local to this device, never sent. */
export const CONTACTS_PERMISSION_QUERY_KEY = ["device", "contactsPermission"] as const;

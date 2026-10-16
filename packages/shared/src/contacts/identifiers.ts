/**
 * Turns an address book into the identifier lists FindContacts takes, and
 * remembers which contact each identifier came from so the reply can be
 * shown under the names saved on this phone. Names never leave the device.
 */

import {
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { DEFAULT_PHONE_REGION, splitE164 } from "../phone/phone";
import { CONTACT_LOOKUP_CHUNK_SIZE, MAX_ADDRESS_BOOK_FIELD_LENGTH } from "./contacts.constants";

/** One phone number as the device reports it. */
export interface AddressBookPhone {
  /** The number as saved: any punctuation, with or without a country code. */
  number: string;
  /** ISO 3166-1 alpha-2 country the device assigns to it, in any case; absent when unknown. */
  countryCode?: string;
}

/** One address-book entry, reduced to what matching reads. */
export interface AddressBookContact {
  /** The device's id for the contact. */
  id: string;
  /** Name as saved on the phone. */
  name: string;
  /** Saved phone numbers. */
  phones: AddressBookPhone[];
  /** Saved email addresses. */
  emails: string[];
}

/** An address book ready to send, plus the map back to its contacts. */
export interface ContactLookup {
  /** Distinct E.164 numbers. */
  phones: string[];
  /** Distinct lower-cased emails. */
  emails: string[];
  /** Normalised identifier → the contacts on this phone that hold it. */
  owners: Map<string, AddressBookContact[]>;
}

/** One FindContacts request's worth of identifiers. */
export interface ContactLookupChunk {
  /** E.164 numbers for this call. */
  phones: string[];
  /** Lower-cased emails for this call. */
  emails: string[];
}

/** Loose address shape, the same check the server applies. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The region named by a BCP 47 locale tag, such as "BD" in "bn-BD".
 *
 * @param localeTag - A locale tag; "" when unknown.
 * @returns The region when the tag names one libphonenumber knows, else null.
 */
function localeRegion(localeTag: string): CountryCode | null {
  const region = localeTag
    .split(/[-_]/)
    .slice(1)
    .find((subtag) => /^[A-Za-z]{2}$/.test(subtag))
    ?.toUpperCase();
  return region !== undefined && isSupportedCountry(region) ? region : null;
}

/**
 * The region a number saved without its country code most likely belongs
 * to: the country of the person's own number, else the region of the
 * device's locale, else the app default. Address books mostly hold numbers
 * from the owner's own country, and the device rarely says which country a
 * saved number belongs to.
 *
 * @param ownPhone - The caller's own E.164 number, or "" when they have none.
 * @param localeTag - The device's locale tag (e.g. "en-BD"), or "" when unknown.
 * @returns A region code for parsing national numbers.
 */
export function lookupRegion(ownPhone: string, localeTag = ""): CountryCode {
  return splitE164(ownPhone)?.region ?? localeRegion(localeTag) ?? DEFAULT_PHONE_REGION;
}

/**
 * Normalises one saved number to E.164. A number with its own "+" or
 * international prefix is read as written; a national number is read in
 * the country the device assigned to it, else in `fallbackRegion`.
 *
 * @param phone - The saved number and its device country.
 * @param fallbackRegion - Region for national numbers the device gave no country.
 * @returns The E.164 number, or null when it is not a valid number.
 */
export function contactPhone(phone: AddressBookPhone, fallbackRegion: CountryCode): string | null {
  if (phone.number.length > MAX_ADDRESS_BOOK_FIELD_LENGTH) return null;
  const deviceRegion = phone.countryCode?.toUpperCase() ?? "";
  const region = isSupportedCountry(deviceRegion) ? deviceRegion : fallbackRegion;
  const parsed = parsePhoneNumberFromString(phone.number.trim(), region);
  return parsed?.isValid() ? parsed.number : null;
}

/**
 * Normalises one saved email the way the server compares addresses.
 *
 * @param email - The saved address.
 * @returns The trimmed, lower-cased address, or null when it is not one.
 */
export function contactEmail(email: string): string | null {
  if (email.length > MAX_ADDRESS_BOOK_FIELD_LENGTH) return null;
  const lowered = email.trim().toLowerCase();
  return EMAIL_SHAPE.test(lowered) ? lowered : null;
}

/**
 * Records that `contact` holds `identifier`, once per contact.
 *
 * @param owners - The map being built.
 * @param identifier - A normalised phone or email.
 * @param contact - The contact that holds it.
 */
function addOwner(
  owners: Map<string, AddressBookContact[]>,
  identifier: string,
  contact: AddressBookContact,
): void {
  const holders = owners.get(identifier) ?? [];
  if (!holders.includes(contact)) holders.push(contact);
  owners.set(identifier, holders);
}

/**
 * Builds the lookup for a whole address book: every valid number and
 * email, normalised and deduplicated, with the caller's own identifiers
 * left out so they do not use up the day's allowance.
 *
 * @param contacts - The address book as read from the device.
 * @param options - `region` for national numbers; `ownIdentifiers` are the
 *   caller's own phone and email, never sent.
 * @returns The identifiers to send and the map back to contacts.
 */
export function buildContactLookup(
  contacts: AddressBookContact[],
  options: { region: CountryCode; ownIdentifiers: string[] },
): ContactLookup {
  const ownSet = new Set(options.ownIdentifiers.map((identifier) => identifier.trim().toLowerCase()));
  const phoneOwners = new Map<string, AddressBookContact[]>();
  const emailOwners = new Map<string, AddressBookContact[]>();
  for (const contact of contacts) {
    for (const phone of contact.phones) {
      const normalized = contactPhone(phone, options.region);
      if (normalized !== null && !ownSet.has(normalized)) addOwner(phoneOwners, normalized, contact);
    }
    for (const email of contact.emails) {
      const normalized = contactEmail(email);
      if (normalized !== null && !ownSet.has(normalized)) addOwner(emailOwners, normalized, contact);
    }
  }
  return {
    phones: [...phoneOwners.keys()],
    emails: [...emailOwners.keys()],
    owners: new Map([...phoneOwners, ...emailOwners]),
  };
}

/**
 * Splits a lookup into FindContacts calls of at most `size` identifiers,
 * phones first.
 *
 * @param lookup - The whole address book's identifiers.
 * @param size - Most identifiers per call.
 * @returns The calls to make, in order; empty for an empty lookup.
 */
export function chunkContactLookup(
  lookup: Pick<ContactLookup, "phones" | "emails">,
  size: number = CONTACT_LOOKUP_CHUNK_SIZE,
): ContactLookupChunk[] {
  const tagged = [
    ...lookup.phones.map((value) => ({ kind: "phone" as const, value })),
    ...lookup.emails.map((value) => ({ kind: "email" as const, value })),
  ];
  const chunks: ContactLookupChunk[] = [];
  for (let start = 0; start < tagged.length; start += size) {
    const slice = tagged.slice(start, start + size);
    chunks.push({
      phones: slice.filter((entry) => entry.kind === "phone").map((entry) => entry.value),
      emails: slice.filter((entry) => entry.kind === "email").map((entry) => entry.value),
    });
  }
  return chunks;
}

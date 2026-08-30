/** Country metadata and E.164 composition for the phone field. */

import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/** One selectable country in the phone field's dropdown. */
export interface PhoneCountry {
  /** ISO 3166-1 alpha-2 code, e.g. "BD". */
  region: CountryCode;
  /** International calling code without the "+", e.g. "880". */
  dialCode: string;
  /** Flag emoji for the region, e.g. "🇧🇩". */
  flag: string;
  /** English country name, e.g. "Bangladesh"; falls back to the region code. */
  name: string;
}

/**
 * Offset from an ASCII capital letter to its regional-indicator symbol.
 *
 * A flag emoji is just its two-letter region code written in regional
 * indicators, so every flag is derivable and none has to be stored.
 */
const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - "A".charCodeAt(0);

/**
 * Renders a region code as its flag emoji.
 *
 * @param region - ISO 3166-1 alpha-2 code.
 * @returns The flag emoji for that region.
 */
export function flagEmoji(region: string): string {
  return [...region.toUpperCase()]
    .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET))
    .join("");
}

/**
 * English country names. `Intl.DisplayNames` is in every browser this app
 * supports, but it is constructed once rather than per row, and guarded so a
 * missing implementation degrades to region codes instead of throwing.
 */
const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/**
 * Every country libphonenumber knows a calling code for, sorted by name.
 *
 * Built from the library's own metadata rather than a checked-in table: the
 * metadata already ships for the server's `normalizePhone`, and a hand-written
 * list would drift the first time a country changed its code.
 */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = getCountries()
  .map((region) => ({
    region,
    dialCode: getCountryCallingCode(region),
    flag: flagEmoji(region),
    name: regionNames?.of(region) ?? region,
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

/** Region selected before the user picks one, matching the server's assumption. */
export const DEFAULT_PHONE_REGION: CountryCode = "US";

/**
 * Looks up one country by region code.
 *
 * @param region - ISO 3166-1 alpha-2 code.
 * @returns That country, or the default region's entry when unknown.
 */
export function phoneCountry(region: string): PhoneCountry {
  return (
    PHONE_COUNTRIES.find((country) => country.region === region) ??
    PHONE_COUNTRIES.find((country) => country.region === DEFAULT_PHONE_REGION)!
  );
}

/**
 * Joins a selected country and a typed national number into E.164.
 *
 * Everything that is not a digit is dropped from the national part: users type
 * "(617) 555-1212" and paste numbers with spaces, and the server wants
 * "+16175551212". Returns "" for an empty number so callers can tell "nothing
 * entered" from "entered something", rather than sending a bare dial code.
 *
 * @param region - Selected region code.
 * @param nationalNumber - What the user typed in the number box.
 * @returns The E.164 string, or "" when no digits were entered.
 */
export function composeE164(region: string, nationalNumber: string): string {
  const digits = nationalNumber.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return `+${phoneCountry(region).dialCode}${digits}`;
}

/** A phone number split into the two halves the field edits. */
export interface SplitPhone {
  /** Region code to select. */
  region: CountryCode;
  /** National number to show in the number box. */
  nationalNumber: string;
}

/**
 * Splits a stored E.164 number back into a country and a national number, so
 * an existing number seeds the field as the user originally entered it.
 *
 * Also used when a full international number is pasted into the number box:
 * pasting "+8801712345678" while the US is selected must switch the country
 * rather than produce "+1" followed by a Bangladeshi number.
 *
 * @param value - An E.164 number, or any string a user might paste.
 * @returns The region and national number, or null when `value` does not parse
 *   as an international number.
 */
export function splitE164(value: string): SplitPhone | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) return null;
  const parsed = parsePhoneNumberFromString(trimmed);
  if (!parsed?.country) return null;
  return { region: parsed.country, nationalNumber: parsed.nationalNumber };
}

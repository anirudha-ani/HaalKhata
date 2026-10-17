/** The device's locale tag, for reading national numbers in the right country. */

/**
 * The locale the device formats dates in, such as "en-BD". Its region is a
 * good guess for numbers saved without a country code.
 *
 * @returns The locale tag, or "" when the runtime cannot say.
 */
export function deviceLocaleTag(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return "";
  }
}

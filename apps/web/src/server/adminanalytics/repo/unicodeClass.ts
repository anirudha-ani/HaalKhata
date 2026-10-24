/**
 * Builds Postgres regular-expression bracket contents from Unicode
 * properties. Postgres's own classes follow the C library's idea of a
 * character, under which a Bengali digit is not a digit and a no-break
 * space is not a space; these lists are Unicode's.
 */

/** Highest Unicode code point. */
const LAST_CODE_POINT = 0x10ffff;

/**
 * Writes one code point as a Postgres regex escape: \uXXXX in the basic
 * plane, \UXXXXXXXX above it. Every character is escaped, so the result
 * holds nothing but backslashes, letters, digits and hyphens, and can sit
 * inside a quoted SQL literal as it is.
 *
 * @param codePoint - The code point.
 * @returns Its escape.
 */
function escapeCodePoint(codePoint: number): string {
  const hexDigits = codePoint.toString(16).toUpperCase();
  return codePoint <= 0xffff ? `\\u${hexDigits.padStart(4, "0")}` : `\\U${hexDigits.padStart(8, "0")}`;
}

/**
 * Every character with a Unicode property, as ranges for the inside of a
 * Postgres bracket expression, e.g. "0-9٠-٩...".
 *
 * Read from the JavaScript engine's own Unicode tables, once per call, so
 * the list is as current as the runtime and never typed out by hand.
 *
 * @param property - A regex matching exactly one character with the
 *   property, with the u flag, e.g. /^\p{Nd}$/u.
 * @returns The ranges, ready to go between "[" and "]".
 */
export function unicodeClass(property: RegExp): string {
  const ranges: string[] = [];
  let rangeStart = -1;
  for (let codePoint = 0; codePoint <= LAST_CODE_POINT + 1; codePoint += 1) {
    const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    const inClass =
      codePoint <= LAST_CODE_POINT && !isSurrogate && property.test(String.fromCodePoint(codePoint));
    if (inClass && rangeStart === -1) rangeStart = codePoint;
    if (!inClass && rangeStart !== -1) {
      const rangeEnd = codePoint - 1;
      ranges.push(
        rangeStart === rangeEnd
          ? escapeCodePoint(rangeStart)
          : `${escapeCodePoint(rangeStart)}-${escapeCodePoint(rangeEnd)}`,
      );
      rangeStart = -1;
    }
  }
  return ranges.join("");
}

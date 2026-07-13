/**
 * Base64 decoding for React Native. Hermes has no `atob`, and the receipt
 * scanner needs the raw bytes of the picked photo (expo-image-picker returns
 * base64) to send through the ParseReceipt RPC.
 */

/** The 64 characters of the standard base64 alphabet, in value order. */
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Lookup table from base64 character code to its 6-bit value (-1 = invalid). */
const SIX_BIT_VALUES = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let position = 0; position < BASE64_ALPHABET.length; position += 1) {
    table[BASE64_ALPHABET.charCodeAt(position)] = position;
  }
  return table;
})();

/**
 * Decodes a base64 string (standard alphabet, optional padding) into bytes.
 *
 * @param base64 - The base64 payload; surrounding whitespace is tolerated.
 * @returns The decoded bytes.
 * @throws Error when the input contains characters outside the base64 alphabet.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/[\s=]+$/, "").trim();
  const byteLength = Math.floor((cleaned.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (let position = 0; position < cleaned.length; position += 1) {
    const value = SIX_BIT_VALUES[cleaned.charCodeAt(position)] ?? -1;
    if (value < 0) throw new Error("invalid base64 input");
    bitBuffer = (bitBuffer << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[byteIndex] = (bitBuffer >> bitCount) & 0xff;
      byteIndex += 1;
    }
  }
  return bytes;
}

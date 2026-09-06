/** Client-generated ids for financial mutations, so a retry names the same operation. */

/**
 * Mints an operation id for one attempt at a financial mutation. The same
 * id is sent on every retry of that attempt and replaced only once the
 * server has answered success, so a lost response cannot store the action
 * twice.
 *
 * `crypto.randomUUID` is only exposed in a secure context — localhost is one,
 * a phone on the LAN over plain http is not — so the id is built from
 * `getRandomValues`, which is available everywhere.
 *
 * @returns A fresh UUID v4.
 */
export function newOperationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexDigits = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hexDigits.slice(0, 8)}-${hexDigits.slice(8, 12)}-${hexDigits.slice(12, 16)}-${hexDigits.slice(16, 20)}-${hexDigits.slice(20)}`;
}

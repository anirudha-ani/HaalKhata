/** Client-generated ids for financial mutations, so a retry names the same operation. */

import { randomUUID } from "expo-crypto";

/**
 * Mints an operation id for one attempt at a financial mutation. The same
 * id is sent on every retry of that attempt and replaced only once the
 * server has answered success, so a lost response cannot store the action
 * twice.
 *
 * @returns A fresh UUID v4.
 */
export function newOperationId(): string {
  return randomUUID();
}

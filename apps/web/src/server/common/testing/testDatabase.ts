/**
 * Names for the throwaway databases integration tests create. Every test
 * run against the shared Postgres — a second suite started while one is
 * going, or another worktree's — drops and recreates its databases, so a
 * fixed name lets one run drop another's mid-test. Each run names its own.
 */

import { randomBytes } from "node:crypto";
import { DATABASE_NAME_SUFFIX_BYTES, MAX_DATABASE_NAME_LENGTH } from "./testing.constants";

/**
 * A database name for one test file in one run: the file's base name and a
 * random suffix.
 *
 * @param base - The file's own name for its database, e.g. "haalkhata_settlement_test".
 * @returns A name no other run uses.
 * @throws Error when the name would be cut short by Postgres.
 */
export function testDatabaseName(base: string): string {
  const name = `${base}_${randomBytes(DATABASE_NAME_SUFFIX_BYTES).toString("hex")}`;
  if (name.length > MAX_DATABASE_NAME_LENGTH) {
    throw new Error(`test database name "${name}" is longer than Postgres keeps`);
  }
  return name;
}

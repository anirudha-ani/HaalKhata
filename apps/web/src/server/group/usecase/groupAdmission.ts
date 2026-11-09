/** Applies the same new-pair safety rule to direct and linked group admissions. */

import type { PoolClient } from "pg";
import { lockFriendRequestInboxes } from "@/server/common/ledger/ledgerLocks";
import { blockedPairExists } from "@/server/safety/repo/safety.repo";

/**
 * Checks the new relationships while excluding changes to their block state.
 * Call after group and admission-capacity locks, before friendship writes.
 * @param existingIds - Members whose existing relationships are preserved.
 * @param candidateIds - People being admitted.
 * @param client - The admission transaction.
 * @param friendUserId - Adder or inviter whose implied friendships share these locks.
 * @returns Whether an introduced relationship is blocked in either direction.
 */
export async function blockedNewGroupPairs(
  existingIds: string[],
  candidateIds: string[],
  client: PoolClient,
  friendUserId: string,
): Promise<boolean> {
  const prospectiveIds = [...new Set([...existingIds, ...candidateIds])];
  await lockFriendRequestInboxes(client, [...candidateIds, friendUserId]);
  return blockedPairExists(prospectiveIds, existingIds, client);
}

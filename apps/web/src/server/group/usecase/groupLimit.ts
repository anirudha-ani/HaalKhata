/** The cap on how many groups one person can be in, checked wherever somebody joins a group. */

import type { PoolClient } from "pg";
import { UsecaseError } from "@/server/common/errors";
import {
  MAX_GROUPS_PER_PERSON,
  OWN_GROUP_LIMIT_MESSAGE,
  groupLimitMessage,
} from "@/server/group/group.constants";
import { countGroupMemberships } from "@/server/group/repo/groups.repo";

/** Somebody about to join a group. */
interface Joiner {
  /** Their user id. */
  id: string;
  /** Their display name, for the refusal. */
  name: string;
}

/**
 * Refuses to put anyone into one more group once they are in
 * {@link MAX_GROUPS_PER_PERSON}. Called inside the joining transaction, after
 * the group's lock, by creating a group, adding members and joining by link.
 *
 * @param joiners - Everyone about to join.
 * @param callerId - Who asked, so their own refusal speaks to them.
 * @param client - The joining transaction.
 * @throws UsecaseError (failed_precondition) naming the first person at the limit.
 */
export async function assertRoomForAnotherGroup(
  joiners: Joiner[],
  callerId: string,
  client: PoolClient,
): Promise<void> {
  const counts = await countGroupMemberships(joiners.map((joiner) => joiner.id), client);
  const full = joiners.find((joiner) => (counts.get(joiner.id) ?? 0) >= MAX_GROUPS_PER_PERSON);
  if (!full) return;
  throw new UsecaseError(
    "failed_precondition",
    full.id === callerId ? OWN_GROUP_LIMIT_MESSAGE : groupLimitMessage(full.name),
  );
}

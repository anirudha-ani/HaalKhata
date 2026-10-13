/** Lifecycle guard requiring an active group before changing its ledger. */

import type { PoolClient } from "pg";
import { findGroupById, findGroupsByIds, type GroupRow } from "@/server/group/repo/groups.repo";
import { notFound, UsecaseError } from "@/server/common/errors";
import { GroupStatus } from "@haalkhata/protogen/group/v1/group_pb";
import { GROUP_STATUS_STORAGE } from "@/server/group/group.constants";

/**
 * Requires a group to be active before changing its ledger.
 *
 * @param groupId - Group receiving the ledger change.
 * @param client - Optional transaction client holding its ledger lock.
 * @returns A promise that resolves when the group is active.
 * @throws UsecaseError when the group is missing or archived.
 */
export async function assertGroupActive(groupId: string, client?: PoolClient): Promise<void> {
  const group = await findGroupById(groupId, client);
  if (!group || group.status === GROUP_STATUS_STORAGE[GroupStatus.DELETED]) notFound("group not found");
  if (group.status !== GROUP_STATUS_STORAGE[GroupStatus.ACTIVE]) {
    throw new UsecaseError(
      "failed_precondition",
      "unarchive this group before changing its expenses or payments",
    );
  }
}

/**
 * Requires every locked settlement scope to be active with one metadata query.
 * @param groupIds - All group scopes that the payment will change.
 * @param client - Transaction client holding every requested group ledger lock.
 * @returns Active metadata keyed by scope, reusable by payment announcements.
 * @throws UsecaseError for a missing, deleted or archived scope.
 */
export async function assertGroupsActive(groupIds: readonly string[], client: PoolClient): Promise<Map<string, GroupRow>> {
  const identifiers = [...new Set(groupIds)];
  if (identifiers.length === 0) return new Map();
  const groups = new Map((await findGroupsByIds(identifiers, client)).map((group) => [group.id, group]));
  for (const groupId of identifiers) {
    const group = groups.get(groupId);
    if (!group || group.status === GROUP_STATUS_STORAGE[GroupStatus.DELETED]) notFound("group not found");
    if (group.status !== GROUP_STATUS_STORAGE[GroupStatus.ACTIVE]) {
      throw new UsecaseError("failed_precondition", "unarchive this group before changing its expenses or payments");
    }
  }
  return groups;
}

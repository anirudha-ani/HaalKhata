/** Lifecycle guard requiring an active group before changing its ledger. */

import type { PoolClient } from "pg";
import { findGroupById } from "@/server/group/repo/groups.repo";
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

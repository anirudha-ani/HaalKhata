/** All SQL for the invite_links table (shareable group-join and profile links). */

import type { PoolClient } from "pg";
import { execute, queryOne } from "@/server/common/db/db";

/** One stored link, exactly as the table holds it. */
export interface InviteLinkRow {
  token: string;
  /** 'group' (join link) or 'profile' ("add me"). */
  kind: "group" | "profile";
  inviter_id: string;
  group_id: string | null;
}

const LINK_COLUMNS = "token, kind, inviter_id, group_id";

/**
 * Looks an ACTIVE link up by its bearer token. Revoked links are invisible
 * here on purpose — to every caller a revoked token and a made-up one are
 * the same thing.
 *
 * @param token - The token from the shared URL.
 * @returns The live link, or undefined.
 */
export async function findActiveLinkByToken(token: string): Promise<InviteLinkRow | undefined> {
  return queryOne<InviteLinkRow>(
    `SELECT ${LINK_COLUMNS} FROM invite_links WHERE token = $1 AND revoked_at IS NULL`,
    [token],
  );
}

/**
 * The group's one active join link, if it has one.
 *
 * @param groupId - Group whose link is looked up.
 * @returns The live link, or undefined.
 */
export async function findActiveGroupLink(groupId: string): Promise<InviteLinkRow | undefined> {
  return queryOne<InviteLinkRow>(
    `SELECT ${LINK_COLUMNS} FROM invite_links
      WHERE group_id = $1 AND kind = 'group' AND revoked_at IS NULL`,
    [groupId],
  );
}

/**
 * Stores a new link. A concurrent create for the same group or profile
 * loses the partial unique index race with SQLSTATE 23505; callers recover
 * by re-reading the winner — both requests wanted the same one link.
 *
 * @param link - The row to insert; groupId is null for a profile link.
 */
export async function insertInviteLink(link: {
  token: string;
  kind: "group" | "profile";
  inviterId: string;
  groupId: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO invite_links (token, kind, inviter_id, group_id)
     VALUES ($1, $2, $3, $4)`,
    [link.token, link.kind, link.inviterId, link.groupId],
  );
}

/**
 * The caller's one active profile link, if it exists.
 *
 * @param inviterId - The profile's owner.
 * @returns The live link, or undefined.
 */
export async function findActiveProfileLink(
  inviterId: string,
): Promise<InviteLinkRow | undefined> {
  return queryOne<InviteLinkRow>(
    `SELECT ${LINK_COLUMNS} FROM invite_links
      WHERE inviter_id = $1 AND kind = 'profile' AND revoked_at IS NULL`,
    [inviterId],
  );
}

/**
 * Revokes the caller's active profile links; the next ask mints afresh.
 *
 * @param inviterId - The profile's owner.
 */
export async function revokeProfileLinks(inviterId: string): Promise<void> {
  await execute(
    `UPDATE invite_links SET revoked_at = now()
      WHERE inviter_id = $1 AND kind = 'profile' AND revoked_at IS NULL`,
    [inviterId],
  );
}

/**
 * Revokes every active link of a group. Old tokens stop resolving at once;
 * a fresh link can be created afterwards.
 *
 * @param groupId - Group whose links are disabled.
 * @param client - Optional transaction client.
 */
export async function revokeGroupLinks(groupId: string, client?: PoolClient): Promise<void> {
  await execute(
    `UPDATE invite_links SET revoked_at = now()
      WHERE group_id = $1 AND revoked_at IS NULL`,
    [groupId],
    client,
  );
}

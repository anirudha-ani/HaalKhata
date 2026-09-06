/** All SQL for the invite_links table (shareable friend-reminder and group-join links). */

import type { PoolClient } from "pg";
import { execute, queryOne } from "@/server/common/db";

/** One stored link, exactly as the table holds it. */
export interface InviteLinkRow {
  token: string;
  /** 'friend' (reminds an Invited person), 'group' (join link), or 'profile' ("add me"). */
  kind: "friend" | "group" | "profile";
  inviter_id: string;
  group_id: string | null;
  invited_user_id: string | null;
}

const LINK_COLUMNS = "token, kind, inviter_id, group_id, invited_user_id";

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
 * The caller's active reminder link for one Invited person, if it exists.
 *
 * @param inviterId - Who shares the link.
 * @param invitedUserId - The unregistered row it claims.
 * @returns The live link, or undefined.
 */
export async function findActiveFriendLink(
  inviterId: string,
  invitedUserId: string,
): Promise<InviteLinkRow | undefined> {
  return queryOne<InviteLinkRow>(
    `SELECT ${LINK_COLUMNS} FROM invite_links
      WHERE inviter_id = $1 AND invited_user_id = $2
        AND kind = 'friend' AND revoked_at IS NULL`,
    [inviterId, invitedUserId],
  );
}

/**
 * Stores a new link. A concurrent create for the same group or pair loses
 * the partial unique index race with SQLSTATE 23505; callers recover by
 * re-reading the winner — both requests wanted the same one link.
 *
 * @param link - The row to insert; null group/invited per the kind's shape.
 */
export async function insertInviteLink(link: {
  token: string;
  kind: "friend" | "group" | "profile";
  inviterId: string;
  groupId: string | null;
  invitedUserId: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO invite_links (token, kind, inviter_id, group_id, invited_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [link.token, link.kind, link.inviterId, link.groupId, link.invitedUserId],
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
 * Revokes the caller's active friend claim link for one Invited person
 * (§37): unfriending them withdraws the link's promise that joining makes
 * you two friends. Other inviters' links for the same person live on.
 *
 * @param inviterId - Whoever is ending the friendship.
 * @param invitedUserId - The Invited row the link would claim.
 * @param client - The removal's transaction client.
 */
export async function revokeFriendLinkForPair(
  inviterId: string,
  invitedUserId: string,
  client?: PoolClient,
): Promise<void> {
  await execute(
    `UPDATE invite_links SET revoked_at = now()
      WHERE kind = 'friend' AND inviter_id = $1 AND invited_user_id = $2
        AND revoked_at IS NULL`,
    [inviterId, invitedUserId],
    client,
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

/**
 * Revokes the active friend links that claim one invited row — called once
 * that row is claimed, since a reminder for an identity that no longer
 * exists should stop resolving rather than 404 into confusion.
 *
 * @param invitedUserId - The just-claimed row.
 * @param client - The claim's transaction client.
 */
export async function revokeFriendLinksFor(
  invitedUserId: string,
  client?: PoolClient,
): Promise<void> {
  await execute(
    `UPDATE invite_links SET revoked_at = now()
      WHERE invited_user_id = $1 AND revoked_at IS NULL`,
    [invitedUserId],
    client,
  );
}

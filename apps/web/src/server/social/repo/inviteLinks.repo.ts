/** All SQL for the invite_links table (shareable group-join and profile links). */

import type { PoolClient } from "pg";
import { execute, queryOne } from "@/server/common/db/db";

/** One stored link, exactly as the table holds it, and whether it has run out or been turned off. */
export interface InviteLinkRow {
  token: string;
  /** 'group' (join link) or 'profile' ("add me"). */
  kind: "group" | "profile";
  inviter_id: string;
  group_id: string | null;
  /** When a group link stops working (ISO 8601); null for a profile link. */
  expires_at: string | null;
  /**
   * Whether it reached its date while it was still on, by the database's
   * clock: past it now, or replaced by a new link once it had run out.
   */
  expired: boolean;
  /** Whether it has been turned off, by its owner or by being replaced. */
  revoked: boolean;
}

const LINK_COLUMNS = `token, kind, inviter_id, group_id, expires_at,
  (expires_at IS NOT NULL AND expires_at <= COALESCE(revoked_at, now())) AS expired,
  (revoked_at IS NOT NULL) AS revoked`;

/**
 * Looks a link up by its bearer token, revoked or not, so the person holding
 * it can be told it expired rather than that it never worked. The usecase
 * treats a link turned off before its date like a made-up token.
 *
 * @param token - The token from the shared URL.
 * @returns The link, or undefined.
 */
export async function findLinkByToken(token: string): Promise<InviteLinkRow | undefined> {
  return queryOne<InviteLinkRow>(`SELECT ${LINK_COLUMNS} FROM invite_links WHERE token = $1`, [token]);
}

/**
 * The group's one join link that has not been revoked, if it has one; it
 * may be past its date.
 *
 * @param groupId - Group whose link is looked up.
 * @returns The link, or undefined.
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
 * @param link - The row to insert; groupId is null for a profile link, and
 *   lifetimeDays null for a link that does not expire.
 * @returns The stored link, with the expiry the database set.
 */
export async function insertInviteLink(link: {
  token: string;
  kind: "group" | "profile";
  inviterId: string;
  groupId: string | null;
  lifetimeDays: number | null;
}): Promise<InviteLinkRow> {
  return (await queryOne<InviteLinkRow>(
    `INSERT INTO invite_links (token, kind, inviter_id, group_id, expires_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $5::int IS NULL THEN NULL ELSE now() + make_interval(days => $5::int) END)
     RETURNING ${LINK_COLUMNS}`,
    [link.token, link.kind, link.inviterId, link.groupId, link.lifetimeDays],
  ))!;
}

/**
 * Revokes one link by its token, and only while it is still active: two
 * people replacing the same expired link both retire it, and neither can
 * turn off the fresh one the other just made.
 *
 * @param token - The link to turn off.
 */
export async function revokeInviteLink(token: string): Promise<void> {
  await execute(
    `UPDATE invite_links SET revoked_at = now() WHERE token = $1 AND revoked_at IS NULL`,
    [token],
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

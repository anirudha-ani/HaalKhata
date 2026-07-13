/** All SQL for the activity table (audience-scoped feed events). */

import { execute, newId, query } from "@/server/common/db";

/** A row from the activity table (column names mirror SQL). */
export interface ActivityRow {
  id: string;
  /** Group the event happened in; null for events outside any group. */
  group_id: string | null;
  /** User id of the person who performed the action. */
  actor_id: string;
  /** Event kind, e.g. "group_created", "member_added". */
  type: string;
  /** Human-readable feed line, pre-rendered at insert time. */
  message: string;
  /** In-app path the feed entry links to. */
  link: string;
  /** JSONB array of user ids allowed to see this event. */
  audience: string[];
  created_at: string;
}

/**
 * Records one activity feed event.
 *
 * @param input - Event data: owning group id (or null when not group
 *   scoped), acting user's id, event kind, pre-rendered message, in-app
 *   link, and the list of user ids who may see the event.
 */
export async function insertActivity(input: {
  groupId: string | null;
  actorId: string;
  type: string;
  message: string;
  link: string;
  audience: string[];
}): Promise<void> {
  await execute(
    `INSERT INTO activity (id, group_id, actor_id, type, message, link, audience)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      newId(),
      input.groupId,
      input.actorId,
      input.type,
      input.message,
      input.link,
      JSON.stringify(input.audience),
    ],
  );
}

/**
 * Lists the newest activity events whose audience includes the given user.
 *
 * @param userId - Id of the user reading the feed; matched against the
 *   audience JSONB array via containment.
 * @param limit - Maximum number of events to return (newest first).
 * @returns Activity rows ordered by creation time descending.
 */
export async function listActivityForUser(
  userId: string,
  limit = 50,
): Promise<ActivityRow[]> {
  // audience is a JSONB array; containment matches membership.
  return query<ActivityRow>(
    `SELECT * FROM activity
     WHERE audience @> to_jsonb($1::text)
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
}

/**
 * Lists the newest activity events recorded for one group.
 *
 * @param groupId - Id of the group whose feed to read.
 * @param limit - Maximum number of events to return (newest first).
 * @returns Activity rows ordered by creation time descending.
 */
export async function listActivityForGroup(
  groupId: string,
  limit = 50,
): Promise<ActivityRow[]> {
  return query<ActivityRow>(
    `SELECT * FROM activity WHERE group_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [groupId, limit],
  );
}

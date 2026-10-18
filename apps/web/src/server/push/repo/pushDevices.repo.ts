/** All SQL for push_devices: the phones that may receive a person's pushes. */

import type { PoolClient } from "pg";
import { execute, newId, query, queryOne } from "@/server/common/db/db";

/** A row from push_devices (column names mirror SQL). */
export interface PushDeviceRow {
  id: string;
  user_id: string;
  installation_id: string;
  expo_token: string;
  platform: string;
  label: string;
  app_version: string;
  /** users.token_version when the phone registered. */
  token_version: number;
  created_at: string;
  last_seen_at: string;
  last_sent_at: string | null;
}

/**
 * The condition a device must meet to be sent to: registered under the
 * owner's current session version, owner neither deleted, merged away nor
 * suspended. Expects push_devices as `device` and users as `owner`.
 */
const LIVE_DEVICE_CONDITION = `device.token_version = owner.token_version
  AND owner.deleted_at IS NULL AND owner.suspended_at IS NULL AND owner.merged_into IS NULL`;

/**
 * Records a phone for a user, or refreshes it. One row per installation: a
 * rotated token or a new owner (the phone changed hands) updates that row.
 * Any other row still holding the same token is removed first, so the unique
 * token can move from a reinstalled app's old installation.
 *
 * The row is written only while the owner's token version still equals the
 * session's: a sign-out that committed first leaves nothing written, and one
 * that commits after leaves a row bound to the version it just retired.
 *
 * @param input - Owner, the version of the session registering, and the
 *   phone's installation id, token, platform, label and app version.
 * @param client - The registration's transaction.
 * @returns The stored row, or undefined when the session's version is no
 *   longer the owner's.
 */
export async function upsertPushDevice(
  input: {
    userId: string;
    tokenVersion: number;
    installationId: string;
    expoToken: string;
    platform: string;
    label: string;
    appVersion: string;
  },
  client: PoolClient,
): Promise<PushDeviceRow | undefined> {
  await execute(
    `DELETE FROM push_devices WHERE expo_token = $1 AND installation_id <> $2`,
    [input.expoToken, input.installationId],
    client,
  );
  return queryOne<PushDeviceRow>(
    `INSERT INTO push_devices
       (id, user_id, installation_id, expo_token, platform, label, app_version, token_version)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
      WHERE EXISTS (SELECT 1 FROM users WHERE id = $2 AND token_version = $8)
     ON CONFLICT (installation_id) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           expo_token = EXCLUDED.expo_token,
           platform = EXCLUDED.platform,
           label = EXCLUDED.label,
           app_version = EXCLUDED.app_version,
           token_version = EXCLUDED.token_version,
           last_seen_at = now()
     RETURNING *`,
    [
      newId(),
      input.userId,
      input.installationId,
      input.expoToken,
      input.platform,
      input.label,
      input.appVersion,
      input.tokenVersion,
    ],
    client,
  );
}

/**
 * Keeps only a user's most recently seen phones.
 *
 * @param userId - Owner whose phones to trim.
 * @param keep - How many to keep.
 * @param client - The registration's transaction.
 */
export async function evictOldestPushDevices(userId: string, keep: number, client: PoolClient): Promise<void> {
  await execute(
    `DELETE FROM push_devices WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM push_devices WHERE user_id = $1 ORDER BY last_seen_at DESC, id DESC LIMIT $2)`,
    [userId, keep],
    client,
  );
}

/**
 * A user's phones that can still be sent to, most recently seen first.
 *
 * @param userId - Owner.
 * @returns Their live devices.
 */
export async function listLivePushDevices(userId: string): Promise<PushDeviceRow[]> {
  return query<PushDeviceRow>(
    `SELECT device.* FROM push_devices device JOIN users owner ON owner.id = device.user_id
      WHERE device.user_id = $1 AND ${LIVE_DEVICE_CONDITION}
      ORDER BY device.last_seen_at DESC, device.id DESC`,
    [userId],
  );
}

/**
 * The live phones of several users, for one dispatch batch.
 *
 * @param userIds - Recipients in the batch.
 * @returns Every live device they own.
 */
export async function listLivePushDevicesForUsers(userIds: string[]): Promise<PushDeviceRow[]> {
  if (userIds.length === 0) return [];
  return query<PushDeviceRow>(
    `SELECT device.* FROM push_devices device JOIN users owner ON owner.id = device.user_id
      WHERE device.user_id = ANY($1::text[]) AND ${LIVE_DEVICE_CONDITION}`,
    [userIds],
  );
}

/**
 * Removes the phones of these users that may no longer be sent to: signed out
 * everywhere since they registered, or owned by an account that was deleted,
 * merged away or suspended.
 *
 * @param userIds - Recipients in the batch.
 */
export async function deleteDeadPushDevicesForUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await execute(
    `DELETE FROM push_devices device USING users owner
      WHERE owner.id = device.user_id AND device.user_id = ANY($1::text[])
        AND NOT (${LIVE_DEVICE_CONDITION})`,
    [userIds],
  );
}

/**
 * One of a user's live phones.
 *
 * @param userId - The caller, who must own it.
 * @param deviceId - The phone.
 * @returns The device, or undefined when it is not the caller's or not live.
 */
export async function findLivePushDevice(userId: string, deviceId: string): Promise<PushDeviceRow | undefined> {
  return queryOne<PushDeviceRow>(
    `SELECT device.* FROM push_devices device JOIN users owner ON owner.id = device.user_id
      WHERE device.id = $1 AND device.user_id = $2 AND ${LIVE_DEVICE_CONDITION}`,
    [deviceId, userId],
  );
}

/**
 * Removes one of a user's phones.
 *
 * @param userId - The caller, who must own it.
 * @param deviceId - The phone.
 * @returns True when a row was removed.
 */
export async function deletePushDevice(userId: string, deviceId: string): Promise<boolean> {
  const removed = await query<{ id: string }>(
    `DELETE FROM push_devices WHERE id = $1 AND user_id = $2 RETURNING id`,
    [deviceId, userId],
  );
  return removed.length > 0;
}

/**
 * Removes phones whose token the delivery service reported dead, but only
 * while each still holds that token. A phone that registered a new token
 * since (a reinstall, a rotation) keeps its row: the report was about the
 * old token.
 *
 * @param entries - Each phone with the token the report was about.
 */
export async function deletePushDevicesHoldingTokens(entries: { deviceId: string; expoToken: string }[]): Promise<void> {
  if (entries.length === 0) return;
  await execute(
    `DELETE FROM push_devices device
      USING unnest($1::text[], $2::text[]) AS dead(device_id, expo_token)
      WHERE device.id = dead.device_id AND device.expo_token = dead.expo_token`,
    [entries.map((entry) => entry.deviceId), entries.map((entry) => entry.expoToken)],
  );
}

/**
 * Stamps the phones a push was just accepted for.
 *
 * @param deviceIds - Devices with an accepted ticket.
 */
export async function markPushDevicesSent(deviceIds: string[]): Promise<void> {
  if (deviceIds.length === 0) return;
  await execute(`UPDATE push_devices SET last_sent_at = now() WHERE id = ANY($1::text[])`, [deviceIds]);
}

/**
 * Removes phones that have not opened the app in a long time.
 *
 * @param days - Age after which a phone is assumed gone.
 */
export async function deleteStalePushDevices(days: number): Promise<void> {
  await execute(`DELETE FROM push_devices WHERE last_seen_at < now() - make_interval(days => $1)`, [days]);
}

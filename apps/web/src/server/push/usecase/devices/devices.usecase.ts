/** The caller's phones: register, list, remove, and send one test push. */

import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { transaction } from "@/server/common/db/db";
import { invalid, notFound, UsecaseError } from "@/server/common/errors";
import { findUserTokenVersion } from "@/server/auth/repo/users.repo";
import { assertSafeText } from "@/server/safety/usecase/contentFilter";
import {
  DEVICE_NOT_REGISTERED,
  EXPO_PUSH_TOKEN_PATTERN,
  INSTALLATION_ID_PATTERN,
  INVISIBLE_CHARACTER_PATTERN,
  DISPLAY_FIELD_RAW_LENGTH_FACTOR,
  MAX_APP_VERSION_LENGTH,
  MAX_DEVICE_LABEL_LENGTH,
  MAX_PUSH_DEVICES_PER_USER,
  PUSH_PLATFORMS,
  PUSH_TIME_TO_LIVE_SECONDS,
} from "@/server/push/push.constants";
import {
  deletePushDevice,
  deletePushDevicesById,
  evictOldestPushDevices,
  findLivePushDevice,
  listLivePushDevices,
  markPushDevicesSent,
  upsertPushDevice,
  type PushDeviceRow,
} from "@/server/push/repo/pushDevices.repo";
import { insertPushTickets } from "@/server/push/repo/pushTickets.repo";
import { countUnreadByUsers } from "@/server/social/repo/notifications.repo";
import { pushProvider } from "@/server/push/usecase/provider/pushProvider";
import { PushTransportError, type PushProvider } from "@/server/push/usecase/provider/pushTypes";

/** What RegisterDevice accepts. */
export interface RegisterDeviceInput {
  expoPushToken: string;
  installationId: string;
  platform: string;
  label: string;
  appVersion: string;
}

/**
 * Projects a stored phone for the client. The token is left out on purpose:
 * once registered it never leaves the server.
 *
 * @param deviceRow - A push_devices row.
 * @returns The Device message init shape.
 */
export function toDevice(deviceRow: PushDeviceRow) {
  return {
    id: deviceRow.id,
    platform: deviceRow.platform,
    label: deviceRow.label,
    appVersion: deviceRow.app_version,
    createdAt: deviceRow.created_at,
    lastSeenAt: deviceRow.last_seen_at,
    lastSentAt: deviceRow.last_sent_at ?? "",
  };
}

/**
 * Removes characters nobody can see and trims a short display field.
 *
 * @param value - Client-supplied text.
 * @param maxLength - Longest accepted value.
 * @param field - Field name for the error.
 * @returns The cleaned value.
 * @throws UsecaseError (invalid_argument) when it is too long or abusive.
 */
function cleanDisplayField(value: string, maxLength: number, field: string): string {
  if (value.length > maxLength * DISPLAY_FIELD_RAW_LENGTH_FACTOR) invalid(`${field} is too long`);
  const cleaned = value.replace(INVISIBLE_CHARACTER_PATTERN, "").trim();
  if ([...cleaned].length > maxLength) invalid(`${field} is too long`);
  assertSafeText(cleaned);
  return cleaned;
}

/**
 * Records this phone for the caller under the caller's current session
 * version. Safe to repeat. A token held by another account moves to the
 * caller (the phone changed hands), and above the per-account limit the phone
 * seen least recently is dropped.
 *
 * @param userId - Authenticated caller.
 * @param input - The phone's token, installation id, platform, label and app version.
 * @returns The stored phone.
 * @throws UsecaseError (invalid_argument) on a malformed field.
 */
export async function registerDevice(userId: string, input: RegisterDeviceInput) {
  if (!EXPO_PUSH_TOKEN_PATTERN.test(input.expoPushToken)) invalid("that is not a push token this app issues");
  if (!INSTALLATION_ID_PATTERN.test(input.installationId)) invalid("installation id is malformed");
  if (!(PUSH_PLATFORMS as readonly string[]).includes(input.platform)) invalid("platform must be ios or android");
  const label = cleanDisplayField(input.label, MAX_DEVICE_LABEL_LENGTH, "device name");
  const appVersion = cleanDisplayField(input.appVersion, MAX_APP_VERSION_LENGTH, "app version");
  const tokenVersion = await findUserTokenVersion(userId);
  if (tokenVersion === undefined) throw new UsecaseError("unauthenticated", "session expired");
  const stored = await transaction(async (client) => {
    const device = await upsertPushDevice(
      {
        userId,
        tokenVersion,
        installationId: input.installationId,
        expoToken: input.expoPushToken,
        platform: input.platform,
        label,
        appVersion,
      },
      client,
    );
    await evictOldestPushDevices(userId, MAX_PUSH_DEVICES_PER_USER, client);
    return device;
  });
  return toDevice(stored);
}

/**
 * The caller's phones that can still receive pushes.
 *
 * @param userId - Authenticated caller.
 * @returns The ListDevicesResponse init shape.
 */
export async function listDevices(userId: string) {
  return { devices: (await listLivePushDevices(userId)).map(toDevice) };
}

/**
 * Stops pushes to one of the caller's phones.
 *
 * @param userId - Authenticated caller.
 * @param deviceId - The phone.
 * @throws UsecaseError (not_found) when it is not one of the caller's.
 */
export async function removeDevice(userId: string, deviceId: string): Promise<void> {
  if (!(await deletePushDevice(userId, deviceId))) notFound("that phone is not connected to your account");
}

/**
 * Sends one push to one of the caller's phones right now, outside the queue,
 * and reports a refusal as an error the screen can show beside the button.
 *
 * @param userId - Authenticated caller.
 * @param deviceId - The phone.
 * @param provider - Delivery service; the configured one by default.
 * @throws UsecaseError (not_found) for a phone that is not the caller's,
 *   (failed_precondition) when the service refuses it, (unavailable) when the
 *   service cannot be reached.
 */
export async function sendTestPush(
  userId: string,
  deviceId: string,
  provider: PushProvider = pushProvider(),
): Promise<void> {
  const device = await findLivePushDevice(userId, deviceId);
  if (!device) notFound("that phone is not connected to your account");
  const unread = (await countUnreadByUsers([userId])).get(userId) ?? 0;
  let tickets;
  try {
    tickets = await provider.send([
      {
        to: device.expo_token,
        title: PUSH_COPY.testTitle,
        body: PUSH_COPY.testBody,
        data: { notificationId: "", link: "/account", recipientId: userId },
        sound: "default",
        badge: unread,
        threadId: "test",
        collapseId: `test-${device.id}`,
        categoryId: "always",
        ttl: PUSH_TIME_TO_LIVE_SECONDS,
        priority: "high",
      },
    ]);
  } catch (error) {
    if (error instanceof PushTransportError) {
      throw new UsecaseError("unavailable", "The notification service didn't answer. Try again in a minute.");
    }
    throw error;
  }
  const [ticket] = tickets;
  if (ticket.status === "ok") {
    await insertPushTickets([{ ticketId: ticket.id, deviceId: device.id }]);
    await markPushDevicesSent([device.id]);
    return;
  }
  if (ticket.details?.error === DEVICE_NOT_REGISTERED) {
    await deletePushDevicesById([device.id]);
    throw new UsecaseError(
      "failed_precondition",
      "That phone isn't reachable any more. Open HaalKhata on it to turn notifications back on.",
    );
  }
  throw new UsecaseError("failed_precondition", `The notification service refused the test: ${ticket.message}`);
}

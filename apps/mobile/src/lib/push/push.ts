/** The phone's side of push: permission, the Expo token, and this installation's ids. */

import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import {
  DEVICE_ID_STORAGE_KEY,
  INSTALLATION_ID_STORAGE_KEY,
  TOKEN_RETRY_DELAYS_MS,
} from "./push.constants";

/** Where this phone stands on notifications. */
export type PushPermission = "granted" | "denied" | "undetermined";

/**
 * Reduces the platform's answer to the three states the app acts on. On
 * iOS the detailed status decides: provisional and ephemeral authorization
 * deliver too, while the generic status can read "granted" for them or not.
 *
 * @param response - What expo-notifications reported.
 * @returns granted, denied or undetermined.
 */
export function toPushPermission(response: Notifications.NotificationPermissionsStatus): PushPermission {
  const iosStatus = response.ios?.status;
  if (iosStatus !== undefined) {
    if (iosStatus === Notifications.IosAuthorizationStatus.NOT_DETERMINED) return "undetermined";
    if (iosStatus === Notifications.IosAuthorizationStatus.DENIED) return "denied";
    return "granted";
  }
  if (response.status === "granted") return "granted";
  return response.status === "denied" ? "denied" : "undetermined";
}

/** @returns This phone's notification permission, without asking. */
export async function readPushPermission(): Promise<PushPermission> {
  return toPushPermission(await Notifications.getPermissionsAsync());
}

/**
 * Shows the system permission alert (once per install; afterwards iOS only
 * reports the earlier answer).
 *
 * @returns The answer.
 */
export async function requestPushPermission(): Promise<PushPermission> {
  return toPushPermission(
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }),
  );
}

/**
 * Waits.
 *
 * @param milliseconds - How long.
 * @returns Resolves after the delay.
 */
function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Gets this phone's Expo push token. The call goes to Expo's servers, so it
 * is retried a couple of times before the failure is reported.
 *
 * @returns The token, "ExponentPushToken[...]".
 * @throws Error when the project id is missing or every attempt failed.
 */
export async function readExpoPushToken(): Promise<string> {
  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== "string" || projectId === "") {
    throw new Error("This build has no EAS project id, so it cannot receive notifications.");
  }
  let lastError: unknown;
  for (const delay of [0, ...TOKEN_RETRY_DELAYS_MS]) {
    if (delay > 0) await wait(delay);
    try {
      return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not reach the notification service.");
}

/**
 * This installation's id, minted on first use. It lets a rotated token
 * update the same server row instead of adding a phone.
 *
 * @returns The id.
 */
export async function installationId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(INSTALLATION_ID_STORAGE_KEY);
  if (stored) return stored;
  const minted = randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_ID_STORAGE_KEY, minted);
  return minted;
}

/** @returns The server's id for this phone, when it is registered. */
export async function storedDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);
}

/** @param deviceId - The server's id for this phone. */
export async function saveDeviceId(deviceId: string): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, deviceId);
}

/** Forgets the server's id for this phone. */
export async function clearDeviceId(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_ID_STORAGE_KEY);
}

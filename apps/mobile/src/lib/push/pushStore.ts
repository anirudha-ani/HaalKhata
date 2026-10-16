/**
 * This phone's push state, shared by the background registration, the
 * first-use explainer and the Account card: permission, the server's id for
 * the phone, and whether connecting it failed. A module store (like the
 * session) so sign-out, outside React, can use it too.
 */

import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { errorMessage, pushClient } from "@/lib/api/connect";
import {
  clearDeviceId,
  installationId,
  readExpoPushToken,
  readPushPermission,
  requestPushPermission,
  saveDeviceId,
  storedDeviceId,
  type PushPermission,
} from "./push";
import { EXPLAINER_SHOWN_STORAGE_KEY, REGISTRATION_REFRESH_MS, REMOVE_DEVICE_TIMEOUT_MS } from "./push.constants";

/** What the screens read. */
export interface PushState {
  /** "unknown" until the phone has been asked. */
  permission: PushPermission | "unknown";
  /** The server's id for this phone once registered. */
  deviceId: string | null;
  registering: boolean;
  /** Why connecting this phone failed, shown on the Account card. */
  error: string;
  /** The first-use explainer is open. */
  explainerOpen: boolean;
}

let state: PushState = { permission: "unknown", deviceId: null, registering: false, error: "", explainerOpen: false };
const listeners = new Set<() => void>();
let lastRegisteredAt = 0;
let registration: Promise<void> | null = null;

/**
 * Replaces part of the state and tells subscribers.
 *
 * @param patch - Fields to change.
 */
function update(patch: Partial<PushState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

/** @returns The current state, for code outside React. */
export function pushState(): PushState {
  return state;
}

/** @returns The current state, re-rendering on change. */
export function usePushState(): PushState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/**
 * Reads the permission (it can change in iOS Settings while the app is away)
 * and the stored device id.
 *
 * @returns The permission.
 */
export async function refreshPushPermission(): Promise<PushPermission> {
  const [permission, deviceId] = await Promise.all([readPushPermission(), storedDeviceId()]);
  update({ permission, deviceId });
  return permission;
}

/**
 * Registers this phone for the signed-in person when notifications are
 * allowed: on launch, once a day while in use, and whenever the token
 * rotates (force). Concurrent calls share one request. Failures are kept for
 * the Account card rather than thrown, since nobody pressed anything.
 *
 * @param force - Register even if it was done recently.
 */
export async function syncThisPhone(force = false): Promise<void> {
  if (registration) return registration;
  if (state.permission !== "granted") return;
  if (!force && state.deviceId && Date.now() - lastRegisteredAt < REGISTRATION_REFRESH_MS) return;
  registration = (async () => {
    update({ registering: true, error: "" });
    try {
      const device = await pushClient.registerDevice({
        expoPushToken: await readExpoPushToken(),
        installationId: await installationId(),
        platform: Platform.OS === "android" ? "android" : "ios",
        label: Device.modelName ?? "",
        appVersion: Constants.expoConfig?.version ?? "",
      });
      await saveDeviceId(device.id);
      lastRegisteredAt = Date.now();
      update({ deviceId: device.id, registering: false });
    } catch (failure) {
      update({ registering: false, error: `${PUSH_COPY.registerFailed} ${errorMessage(failure)}` });
    } finally {
      registration = null;
    }
  })();
  return registration;
}

/**
 * Asks iOS for permission (from the explainer's Continue) and connects the
 * phone when it is given.
 *
 * @returns The answer.
 */
export async function turnOnPush(): Promise<PushPermission> {
  const permission = await requestPushPermission();
  update({ permission });
  if (permission === "granted") await syncThisPhone(true);
  return permission;
}

/**
 * Opens the first-use explainer — once per phone unless asked from Account,
 * and only while iOS has not been asked yet, because its alert shows once.
 *
 * @param fromAccount - The person tapped "Turn on"; show it even if shown before.
 */
export async function offerPushExplainer(fromAccount = false): Promise<void> {
  try {
    if ((await refreshPushPermission()) !== "undetermined") return;
    if (!fromAccount && (await SecureStore.getItemAsync(EXPLAINER_SHOWN_STORAGE_KEY))) return;
    await SecureStore.setItemAsync(EXPLAINER_SHOWN_STORAGE_KEY, "1");
    update({ explainerOpen: true });
  } catch (failure) {
    update({ error: errorMessage(failure) });
  }
}

/** Closes the explainer. */
export function closePushExplainer(): void {
  update({ explainerOpen: false });
}

/**
 * Stops pushes to this phone before signing out, then clears what the next
 * person on the phone could see: the badge and every delivered banner. The
 * server call is best effort with a short limit; if it fails, signing out
 * everywhere already makes the server ignore this phone.
 */
export async function forgetThisPhone(): Promise<void> {
  const deviceId = state.deviceId ?? (await storedDeviceId().catch(() => null));
  if (deviceId) {
    await Promise.race([
      pushClient.removeDevice({ deviceId }).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, REMOVE_DEVICE_TIMEOUT_MS)),
    ]);
  }
  await clearPushTraces();
}

/**
 * Clears what this phone holds for the account that is leaving: the stored
 * device id, the badge and every delivered banner. Used directly after an
 * account deletion, when the server has already removed its phones.
 */
export async function clearPushTraces(): Promise<void> {
  await clearDeviceId().catch(() => undefined);
  await Notifications.setBadgeCountAsync(0).catch(() => false);
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  lastRegisteredAt = 0;
  update({ deviceId: null, error: "", explainerOpen: false });
}

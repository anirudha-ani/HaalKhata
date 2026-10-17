/**
 * This phone's side of the first-run flow: whether the person who just
 * signed in here still has the device steps ahead of them, and what the
 * phone already allows.
 *
 * The marks live in AsyncStorage, not the Keychain. They are not secrets,
 * and iOS keeps Keychain items after an app is deleted while it resets the
 * app's permissions; a "done" mark that outlived a reinstall would skip
 * steps whose questions iOS is about to ask afresh. Signing in as someone
 * else on the same phone gets its own mark, so they are asked too.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPermissionsAsync } from "expo-contacts";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { contactsAccessOf } from "@/lib/contacts/contactsAccess";
import { readPushPermission } from "@/lib/push/push";
import { SETUP_DONE_STORAGE_PREFIX, SETUP_DUE_STORAGE_KEY } from "./onboarding.constants";
import { planOnboardingSteps, type OnboardingSituation } from "./onboardingPlan";

/**
 * The storage key for one account's "done" mark.
 *
 * @param userId - The account.
 * @returns The key.
 */
function doneKey(userId: string): string {
  return `${SETUP_DONE_STORAGE_PREFIX}${userId}`;
}

/**
 * Records that someone just signed in on this phone. Called by every sign-in
 * path before the session is stored. A storage failure only means the
 * device steps are not offered, which must never stop the sign-in.
 */
export async function markDeviceSetupDue(): Promise<void> {
  await AsyncStorage.setItem(SETUP_DUE_STORAGE_KEY, "1").catch(() => undefined);
}

/**
 * Whether this phone owes the person the device steps: someone signed in
 * here and this account has not finished them on this phone.
 *
 * @param userId - The signed-in account.
 * @returns True when the steps are still owed.
 */
export async function isDeviceSetupOwed(userId: string): Promise<boolean> {
  const [dueMark, doneMark] = await Promise.all([
    AsyncStorage.getItem(SETUP_DUE_STORAGE_KEY),
    AsyncStorage.getItem(doneKey(userId)),
  ]);
  return dueMark !== null && doneMark === null;
}

/**
 * Marks the device steps finished for this account on this phone.
 *
 * @param userId - The signed-in account.
 */
export async function finishDeviceSetup(userId: string): Promise<void> {
  await AsyncStorage.setItem(doneKey(userId), "1");
  await AsyncStorage.removeItem(SETUP_DUE_STORAGE_KEY);
}

/**
 * Reads everything the plan depends on. Permissions are read, never
 * requested: asking is each step's job, after it has said why.
 *
 * @param user - The signed-in account.
 * @returns The situation to plan from.
 */
export async function readOnboardingSituation(user: User): Promise<OnboardingSituation> {
  const [deviceSetupOwed, contactsAccess, pushPermission] = await Promise.all([
    user.onboarded ? isDeviceSetupOwed(user.id) : Promise.resolve(true),
    getPermissionsAsync().then(contactsAccessOf, () => undefined),
    readPushPermission().catch(() => "unknown" as const),
  ]);
  return {
    accountSetup: !user.onboarded,
    deviceSetupOwed,
    phoneVerified: user.phone !== "" && user.phoneVerified,
    contactsAccess,
    pushPermission,
  };
}

/**
 * Whether the signed-in app should hand a set-up account to the flow now.
 * When the phone owes nothing that would actually be shown (every question
 * already answered here), the debt is settled on the spot so later launches
 * skip even the check.
 *
 * @param user - The signed-in, onboarded account.
 * @returns True when the flow has steps to show.
 */
export async function deviceSetupPending(user: User): Promise<boolean> {
  if (!(await isDeviceSetupOwed(user.id))) return false;
  if (planOnboardingSteps(await readOnboardingSituation(user)).length > 0) return true;
  await finishDeviceSetup(user.id);
  return false;
}

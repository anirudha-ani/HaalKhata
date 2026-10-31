/**
 * Keeps a session on the phone it was signed in on, and in the install it
 * was signed in on.
 *
 * The iOS keychain outlives the app: delete HaalKhata, install it again, and
 * by default it comes back signed in as whoever had it before, which is not
 * what somebody handing on a phone expects. An app update looks the same from
 * the keychain's side, and must not sign anyone out, so a flag alone cannot
 * tell them apart. The install's date can: it survives an update, changes on
 * a reinstall, and is kept beside the token in the keychain to compare with.
 */

import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import {
  INSTALL_DATE_DRIFT_MS,
  INSTALL_MARKER_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  UNFINISHED_SIGN_OUT_STORAGE_KEY,
} from "./api.constants";

/**
 * How anything that can act as the account is kept: readable while the phone
 * is unlocked, and left out of backups and transfers to a new phone.
 */
export const THIS_DEVICE_ONLY: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Whether two install dates are the same install. They are read from a folder's
 * date, so a little drift is allowed for: signing somebody out over a rounding
 * would be far worse than the odd reinstall within a minute.
 *
 * @param marked - The date kept in the keychain, in milliseconds as text.
 * @param installedAt - This install's date, in milliseconds.
 * @returns True when they match.
 */
export function isSameInstall(marked: string, installedAt: number): boolean {
  return Math.abs(Number(marked) - installedAt) <= INSTALL_DATE_DRIFT_MS;
}

/**
 * Moves a token that came with an earlier install out of the way. It goes to
 * the unfinished sign-outs, so the server ends that session too: left alone it
 * would stay listed among the person's devices with nobody on it.
 */
async function retireTokenOfEarlierInstall(): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  if (!token) return;
  await SecureStore.setItemAsync(UNFINISHED_SIGN_OUT_STORAGE_KEY, token, THIS_DEVICE_ONLY);
  await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
}

/** Saves what is already stored again under {@link THIS_DEVICE_ONLY}: saving it is what changes how it is kept. */
async function sealTokensToThisDevice(): Promise<void> {
  for (const storageKey of [TOKEN_STORAGE_KEY, UNFINISHED_SIGN_OUT_STORAGE_KEY]) {
    const stored = await SecureStore.getItemAsync(storageKey);
    if (stored) await SecureStore.setItemAsync(storageKey, stored, THIS_DEVICE_ONLY);
  }
}

/**
 * Checks this launch against the install the stored session belongs to, before
 * the session is read. With no date kept yet this is the first launch of a
 * version that keeps one, so whoever is signed in stays signed in, and from
 * then on is protected. Anything failing here leaves the session as it was: a
 * person must never be signed out because this check could not run.
 */
export async function settleThisInstall(): Promise<void> {
  try {
    const installedAt = (await Application.getInstallationTimeAsync()).getTime();
    const marked = await SecureStore.getItemAsync(INSTALL_MARKER_STORAGE_KEY);
    if (marked !== null && isSameInstall(marked, installedAt)) return;
    if (marked === null) await sealTokensToThisDevice();
    else await retireTokenOfEarlierInstall();
    await SecureStore.setItemAsync(INSTALL_MARKER_STORAGE_KEY, String(installedAt), THIS_DEVICE_ONLY);
  } catch {
    // The check is a protection, not a condition for being signed in.
  }
}

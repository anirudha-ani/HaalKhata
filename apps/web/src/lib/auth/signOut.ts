/**
 * Signing out of this browser, which is two steps. The screen can stop showing
 * a person's data at once, but the session itself is an HttpOnly cookie that
 * only the server can end, so the sign-out is remembered until it has.
 */

import { SIGN_OUT_PENDING_STORAGE_KEY } from "./constants/signOut";

/** Stays true once this tab has seen a sign-out: nothing brings a signed-out tab back but leaving it. */
let pendingHere = false;
/** Components watching for a sign-out in this tab. */
const listeners = new Set<() => void>();
/** How many mounted pages count a refused session as the end of it. */
let sessionWatchers = 0;

/**
 * Whether a sign-out is waiting for the server, in this tab or another.
 * Browsers can deny storage, which only costs the other tabs their warning.
 *
 * @returns True until this tab has finished it.
 */
export function isSignOutPending(): boolean {
  if (pendingHere) return true;
  try {
    pendingHere = window.localStorage.getItem(SIGN_OUT_PENDING_STORAGE_KEY) !== null;
  } catch {
    // Storage is blocked: this tab's own memory is all there is.
  }
  return pendingHere;
}

/** Starts signing out: every tab in this browser stops showing the account. */
export function beginSignOut(): void {
  pendingHere = true;
  try {
    window.localStorage.setItem(SIGN_OUT_PENDING_STORAGE_KEY, "1");
  } catch {
    // Storage is blocked: this tab still signs out.
  }
  for (const listener of listeners) listener();
}

/**
 * Forgets a sign-out once the server has ended the session, or once somebody
 * has signed in afresh. This tab stays as it is: both leave the page next, and
 * the app must not flash back in the moment before it goes.
 */
export function forgetSignOut(): void {
  try {
    window.localStorage.removeItem(SIGN_OUT_PENDING_STORAGE_KEY);
  } catch {
    // Storage is blocked, so nothing was saved to remove.
  }
}

/**
 * Calls back when a sign-out starts here or in another tab of this browser.
 *
 * @param listener - What to call.
 * @returns Stops listening.
 */
export function subscribeToSignOut(listener: () => void): () => void {
  /**
   * Passes on a sign-out started in another tab, which is what this event is:
   * browsers do not send it to the tab that made the change.
   *
   * @param event - The storage change.
   */
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIGN_OUT_PENDING_STORAGE_KEY && event.newValue !== null) listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Makes a refused session end the app in this tab, for as long as a signed-in
 * page is mounted. Public pages ask who is signed in and expect "nobody".
 *
 * @returns Stops watching.
 */
export function watchSession(): () => void {
  sessionWatchers += 1;
  return () => {
    sessionWatchers -= 1;
  };
}

/** Called when the server refuses this browser's session: inside the app, that ends it. */
export function noticeSessionEnded(): void {
  if (sessionWatchers > 0 && !pendingHere) beginSignOut();
}

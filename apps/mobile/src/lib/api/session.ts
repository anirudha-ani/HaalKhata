/**
 * Bearer-token session store. The token returned by LogIn/SignUp is kept in
 * memory for the transport interceptor and persisted to SecureStore across
 * launches; React reads it through {@link useSession}.
 */

import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { clearPendingInvite } from "@/lib/invite/pendingInvite";
import { TOKEN_STORAGE_KEY } from "./api.constants";
import { settleThisInstall, THIS_DEVICE_ONLY } from "./thisInstall";

/** Snapshot of the session state exposed to React. */
export interface SessionState {
  /** The bearer token, or null when signed out. */
  token: string | null;
  /** True once the persisted token has been read from SecureStore. */
  hydrated: boolean;
}

let snapshot: SessionState = { token: null, hydrated: false };
const listeners = new Set<() => void>();
let revision = 0;
let hydration: Promise<void> | undefined;
let persistence = Promise.resolve();

/**
 * Serializes keychain writes so a slow renewal cannot outlive a sign-out.
 * @param operation - The next storage update in session order.
 * @returns Completion, retaining the in-memory session if storage is unavailable.
 */
function persist(operation: () => Promise<void>): Promise<void> {
  persistence = persistence.then(operation).catch(() => undefined);
  return persistence;
}

/** @returns The generation used to reject responses from an earlier session. */
export function sessionRevision(): number {
  return revision;
}

/**
 * Replaces the session snapshot and notifies every subscriber.
 *
 * @param next - The new session state.
 */
function publish(next: SessionState): void {
  revision += 1;
  snapshot = next;
  for (const listener of listeners) listener();
}

/**
 * Returns the current bearer token without subscribing (for the transport).
 *
 * @returns The token, or null when signed out.
 */
export function sessionToken(): string | null {
  return snapshot.token;
}

/**
 * Loads the persisted token from SecureStore into memory. Called once at
 * startup; safe to call again (no-ops after the first hydration).
 */
export async function hydrateSession(): Promise<void> {
  if (snapshot.hydrated) return;
  if (!hydration) {
    const startedAt = revision;
    hydration = (async () => {
      let stored: string | null = null;
      await settleThisInstall();
      try {
        stored = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
      } catch {
        // Unreadable keychain entry — treat as signed out.
      }
      // Login or logout may have completed while the keychain read was pending.
      if (revision === startedAt) publish({ token: stored, hydrated: true });
    })();
  }
  await hydration;
}

/**
 * Stores a freshly issued bearer token (after login/signup) and persists it.
 *
 * @param token - The bearer token returned by the auth RPC.
 */
export async function setSessionToken(token: string): Promise<void> {
  publish({ token, hydrated: true });
  await persist(() => SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token, THIS_DEVICE_ONLY));
}

/**
 * Clears the session (sign-out, account deletion, or the server rejected the
 * token), and with it any join link saved for the next sign-in on this
 * phone: whoever signs in after this is not necessarily who saved it.
 */
export async function clearSession(): Promise<void> {
  publish({ token: null, hydrated: true });
  await Promise.all([
    persist(() => SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY)),
    // Storage that cannot be written leaves a link that still expires.
    clearPendingInvite().catch(() => undefined),
  ]);
}

/**
 * Registers a listener for session changes.
 *
 * @param listener - Called whenever the session snapshot is replaced.
 * @returns An unsubscribe function.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * React hook exposing the live session state.
 *
 * @returns The current `{ token, hydrated }` snapshot; re-renders on change.
 */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/**
 * Bearer-token session store. The token returned by LogIn/SignUp is kept in
 * memory for the transport interceptor and persisted to SecureStore across
 * launches; React reads it through {@link useSession}.
 */

import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { TOKEN_STORAGE_KEY } from "./api.constants";

/** Snapshot of the session state exposed to React. */
export interface SessionState {
  /** The bearer token, or null when signed out. */
  token: string | null;
  /** True once the persisted token has been read from SecureStore. */
  hydrated: boolean;
}

let snapshot: SessionState = { token: null, hydrated: false };
const listeners = new Set<() => void>();

/**
 * Replaces the session snapshot and notifies every subscriber.
 *
 * @param next - The new session state.
 */
function publish(next: SessionState): void {
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
  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  } catch {
    // Unreadable keychain entry — treat as signed out.
  }
  publish({ token: stored, hydrated: true });
}

/**
 * Stores a freshly issued bearer token (after login/signup) and persists it.
 *
 * @param token - The bearer token returned by the auth RPC.
 */
export async function setSessionToken(token: string): Promise<void> {
  publish({ token, hydrated: true });
  try {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
  } catch {
    // Persistence failed — the in-memory session still works for this launch.
  }
}

/** Clears the session (sign-out, or the server rejected the token). */
export async function clearSession(): Promise<void> {
  publish({ token: null, hydrated: true });
  try {
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
  } catch {
    // Nothing stored — already signed out.
  }
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

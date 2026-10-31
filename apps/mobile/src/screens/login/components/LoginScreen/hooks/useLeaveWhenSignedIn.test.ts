/** @vitest-environment jsdom */
/** The welcome screen leaves once a session exists, once, for a waiting invite or Home; somebody signed in is never shown the sign-in buttons. */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumePendingInvite } from "@/lib/invite/consumePendingInvite";
import { useLeaveWhenSignedIn } from "./useLeaveWhenSignedIn";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/invite/consumePendingInvite", () => ({ consumePendingInvite: vi.fn() }));
// The phone's saved session as the app holds it.
const savedSession = vi.hoisted(() => {
  let state: { token: string | null; hydrated: boolean } = { token: null, hydrated: true };
  const listeners = new Set<() => void>();
  return {
    read: () => state,
    set: (next: { token: string | null; hydrated: boolean }) => {
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock("@/lib/api/session", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useSession: () => useSyncExternalStore(savedSession.subscribe, savedSession.read) };
});

let root: Root;
let container: HTMLDivElement;

/**
 * Stands in for the welcome screen: the buttons, or the spinner while it leaves.
 *
 * @returns What the screen would show.
 */
function WelcomeScreen() {
  return createElement("p", null, useLeaveWhenSignedIn() ? "Spinner" : "Sign-in buttons");
}

/** @returns Waits for the departure's promise chain and any re-render. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Opens the welcome screen with the phone's session as given.
 *
 * @param session - The saved session when the screen opens.
 */
async function open(session: { token: string | null; hydrated: boolean }) {
  savedSession.set(session);
  await act(async () => root.render(createElement(WelcomeScreen)));
  await settle();
}

/**
 * Changes the phone's session while the screen is open.
 *
 * @param session - The new session.
 */
async function sessionBecomes(session: { token: string | null; hydrated: boolean }) {
  await act(async () => savedSession.set(session));
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(consumePendingInvite).mockResolvedValue("/join/flat-link");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("leaving the welcome screen", () => {
  it("sends somebody who arrives already signed in to the invite they were opening, not to the sign-in buttons", async () => {
    await open({ token: "tomas-session", hydrated: true });

    expect(container.textContent).toBe("Spinner");
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/join/flat-link");
  });

  it("waits for the saved session, and stays for somebody signed out", async () => {
    await open({ token: null, hydrated: false });
    expect(container.textContent).toBe("Spinner");
    expect(consumePendingInvite).not.toHaveBeenCalled();

    await sessionBecomes({ token: null, hydrated: true });

    expect(container.textContent).toBe("Sign-in buttons");
    expect(consumePendingInvite).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("leaves once after a sign-in here, even when the token is renewed straight after", async () => {
    await open({ token: null, hydrated: true });

    await sessionBecomes({ token: "tomas-session", hydrated: true });
    await sessionBecomes({ token: "tomas-session-renewed", hydrated: true });

    // A second departure would find the invite taken and send them Home over it.
    expect(consumePendingInvite).toHaveBeenCalledOnce();
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/join/flat-link");
  });

  it("goes Home when the saved invite cannot be read", async () => {
    vi.mocked(consumePendingInvite).mockRejectedValue(new Error("storage unavailable"));

    await open({ token: "tomas-session", hydrated: true });

    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });
});

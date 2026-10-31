/** @vitest-environment jsdom */
/** A sign-out reaches every tab, survives a closed tab, and never ends a later session. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGN_OUT_PENDING_STORAGE_KEY } from "./constants/signOut";

let signOut: typeof import("./signOut");

beforeEach(async () => {
  window.localStorage.clear();
  vi.resetModules();
  signOut = await import("./signOut");
});

afterEach(() => vi.restoreAllMocks());

describe("signing out", () => {
  it("tells this tab at once, and is remembered if the tab is closed", () => {
    const listener = vi.fn();
    signOut.subscribeToSignOut(listener);

    signOut.beginSignOut();

    expect(listener).toHaveBeenCalledOnce();
    expect(signOut.isSignOutPending()).toBe(true);
    expect(window.localStorage.getItem(SIGN_OUT_PENDING_STORAGE_KEY)).not.toBeNull();
  });

  it("is picked up by a page opened later, in a new tab or after a closed one", async () => {
    signOut.beginSignOut();
    vi.resetModules();

    expect((await import("./signOut")).isSignOutPending()).toBe(true);
  });

  it("hears a sign-out started in another tab", () => {
    const listener = vi.fn();
    signOut.subscribeToSignOut(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: SIGN_OUT_PENDING_STORAGE_KEY, newValue: "1" }));

    expect(listener).toHaveBeenCalledOnce();
  });

  it("ignores another tab's other storage, and a sign-out finishing", () => {
    const listener = vi.fn();
    signOut.subscribeToSignOut(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "something-else", newValue: "1" }));
    window.dispatchEvent(new StorageEvent("storage", { key: SIGN_OUT_PENDING_STORAGE_KEY, newValue: null }));

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops listening when asked", () => {
    const listener = vi.fn();
    signOut.subscribeToSignOut(listener)();

    signOut.beginSignOut();

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps a tab away from the app once it has started, so it cannot flash back before leaving", () => {
    signOut.beginSignOut();

    signOut.forgetSignOut();

    expect(signOut.isSignOutPending()).toBe(true);
  });

  it("leaves nothing behind for the next person to sign in", async () => {
    signOut.beginSignOut();
    signOut.forgetSignOut();
    vi.resetModules();

    expect((await import("./signOut")).isSignOutPending()).toBe(false);
  });

  it("still works in a browser that denies storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    signOut.beginSignOut();

    expect(signOut.isSignOutPending()).toBe(true);
  });
});

describe("a refused session", () => {
  it("ends the app while a signed-in page is mounted", () => {
    const stopWatching = signOut.watchSession();

    signOut.noticeSessionEnded();

    expect(signOut.isSignOutPending()).toBe(true);
    stopWatching();
  });

  it("means nothing on a public page, which expects nobody to be signed in", () => {
    signOut.noticeSessionEnded();

    expect(signOut.isSignOutPending()).toBe(false);
  });

  it("stops counting when the signed-in page goes", () => {
    signOut.watchSession()();

    signOut.noticeSessionEnded();

    expect(signOut.isSignOutPending()).toBe(false);
  });
});

/** @vitest-environment jsdom */
/** A held sign-in nonce is renewed at half its life, only while the page is in view, and at once when it comes back into view stale. */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNonceRenewal, type HeldNonce } from "./useNonceRenewal";

let root: Root;
let container: HTMLDivElement;
let visibility: DocumentVisibilityState = "visible";
const renew = vi.fn();

/**
 * Renders nothing; holds `held` the way a sign-in hook does.
 *
 * @param props - The nonce held.
 * @returns Nothing.
 */
function Holder({ held }: { held: HeldNonce | null }) {
  useNonceRenewal(held, renew);
  return null;
}

/**
 * Mounts a holder of a nonce received now.
 *
 * @param lifetimeSeconds - What the server said it lasts.
 */
function holdNonce(lifetimeSeconds: number) {
  act(() => root.render(createElement(Holder, { held: { receivedAt: Date.now(), lifetimeSeconds } })));
}

/**
 * Switches the page in or out of view, as the browser does.
 *
 * @param state - The page's new visibility.
 */
function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  visibility = "visible";
  renew.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useNonceRenewal", () => {
  it("renews at half the nonce's life while the page is in view", () => {
    holdNonce(600);

    act(() => vi.advanceTimersByTime(299_000));
    expect(renew).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(renew).toHaveBeenCalledOnce();
  });

  it("asks for nothing while the page is hidden, and renews at once when it comes back stale", () => {
    holdNonce(600);
    setVisibility("hidden");

    act(() => vi.advanceTimersByTime(20 * 60_000));
    expect(renew).not.toHaveBeenCalled();

    setVisibility("visible");
    expect(renew).toHaveBeenCalledOnce();
  });

  it("waits out the rest of the half-life when the page comes back while the nonce is still fresh", () => {
    holdNonce(600);
    setVisibility("hidden");
    act(() => vi.advanceTimersByTime(60_000));

    setVisibility("visible");
    expect(renew).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(240_000));
    expect(renew).toHaveBeenCalledOnce();
  });

  it("assumes the old five minutes when the server does not say", () => {
    holdNonce(0);

    act(() => vi.advanceTimersByTime(150_000));
    expect(renew).toHaveBeenCalledOnce();
  });

  it("does nothing while no nonce is held", () => {
    act(() => root.render(createElement(Holder, { held: null })));
    setVisibility("hidden");
    setVisibility("visible");

    act(() => vi.advanceTimersByTime(60 * 60_000));
    expect(renew).not.toHaveBeenCalled();
  });
});

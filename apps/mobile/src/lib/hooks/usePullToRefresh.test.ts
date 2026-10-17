/** @vitest-environment jsdom */
/** The pull spinner shows for a pull and nothing else, and always comes down. */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePullToRefresh } from "./usePullToRefresh";

let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof usePullToRefresh>;

/**
 * Mounts a component that exposes the hook's latest state.
 *
 * @param reload - What a pull refetches.
 */
function mount(reload: () => Promise<unknown>) {
  /** Records the hook's state on every render. */
  function Probe() {
    latest = usePullToRefresh(reload);
    return null;
  }
  act(() => root.render(createElement(Probe)));
}

/**
 * A reload the test settles by hand.
 *
 * @returns The reload and its resolve and reject handles.
 */
function deferredReload() {
  let resolve: () => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { reload: vi.fn(() => promise), resolve, reject };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("usePullToRefresh", () => {
  it("is off until the person pulls, however the data reloads in the background", () => {
    const { reload } = deferredReload();
    mount(reload);
    expect(latest.isRefreshing).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows from the pull until every refetch has settled", async () => {
    const pending = deferredReload();
    mount(pending.reload);
    act(() => latest.refresh());
    expect(pending.reload).toHaveBeenCalledOnce();
    expect(latest.isRefreshing).toBe(true);
    await act(async () => pending.resolve());
    expect(latest.isRefreshing).toBe(false);
  });

  it("comes down when the reload fails, leaving the error to the screen", async () => {
    const pending = deferredReload();
    mount(pending.reload);
    act(() => latest.refresh());
    await act(async () => pending.reject(new Error("offline")));
    expect(latest.isRefreshing).toBe(false);
  });
});

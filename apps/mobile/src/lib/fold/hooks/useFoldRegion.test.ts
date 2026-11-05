/** @vitest-environment jsdom */
/** The fold must follow the hinge and the window, and count as absent wherever it cannot be read. */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFoldRegion } from "./useFoldRegion";

type Region = { x: number; y: number; width: number; height: number };
const native = vi.hoisted(() => ({
  present: true,
  window: { width: 669, height: 951 },
  getFold: vi.fn<() => Promise<Region | null>>(),
  listener: undefined as ((event: { fold: Region | null }) => void) | undefined,
  removed: 0,
}));
vi.mock("react-native", () => ({ useWindowDimensions: () => native.window }));
vi.mock("@/lib/fold/foldModule", () => ({
  get foldModule() {
    return native.present
      ? {
          getFold: native.getFold,
          addListener: (_name: string, listener: (event: { fold: Region | null }) => void) => {
            native.listener = listener;
            return { remove: () => { native.removed += 1; } };
          },
        }
      : null;
  },
}));

const ACROSS = { x: 0, y: 455, width: 669, height: 40 };
let root: Root;
let container: HTMLDivElement;

/** @returns The fold the hook reports, written out for the test to read. */
function Probe() {
  return createElement("output", null, JSON.stringify(useFoldRegion()));
}

/** Renders the probe and lets the first query settle. */
async function render() {
  await act(async () => root.render(createElement(Probe)));
}

/** @returns The fold the probe last reported. */
function reported() {
  return JSON.parse(container.querySelector("output")?.textContent ?? "null");
}

beforeEach(() => {
  Object.assign(native, { present: true, window: { width: 669, height: 951 }, listener: undefined, removed: 0 });
  native.getFold.mockReset().mockResolvedValue(null);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("fold region", () => {
  it("reads the fold when shown and follows the hinge after that", async () => {
    native.getFold.mockResolvedValue(ACROSS);
    await render();
    expect(reported()).toEqual(ACROSS);
    act(() => native.listener?.({ fold: null }));
    expect(reported()).toBeNull();
  });
  it("asks again when the window changes size, as it does when the device opens or turns", async () => {
    await render();
    expect(native.getFold).toHaveBeenCalledTimes(1);
    native.getFold.mockResolvedValue({ x: 455, y: 0, width: 40, height: 669 });
    native.window = { width: 951, height: 669 };
    await render();
    expect(native.getFold).toHaveBeenCalledTimes(2);
    expect(reported()).toEqual({ x: 455, y: 0, width: 40, height: 669 });
    expect(native.removed).toBe(1);
  });
  it("counts the window as unfolded when the fold cannot be read", async () => {
    native.getFold.mockRejectedValue(new Error("no window"));
    await render();
    expect(reported()).toBeNull();
  });
  it("counts the window as unfolded where there is no fold reporter", async () => {
    native.present = false;
    await render();
    expect(reported()).toBeNull();
    expect(native.getFold).not.toHaveBeenCalled();
  });
});

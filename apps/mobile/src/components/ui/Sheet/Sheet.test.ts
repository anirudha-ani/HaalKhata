/** @vitest-environment jsdom */
/** Dialog bounds and actions must survive iPad rotation and narrow multitasking windows. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

const viewport = vi.hoisted(() => ({ width: 1024, height: 600, fontScale: 1 }));
const insets = vi.hoisted(() => ({ top: 24, bottom: 20, left: 0, right: 0 }));
vi.mock("lucide-react-native", () => ({ X: () => null }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => insets,
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => undefined }) },
  useWindowDimensions: () => viewport,
  Platform: { OS: "ios", select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  Modal: ({ children, supportedOrientations }: { children: ReactNode; supportedOrientations: string[] }) =>
    createElement("div", { role: "dialog", "data-orientations": supportedOrientations.join(",") }, children),
  KeyboardAvoidingView: ({ children, style }: { children: ReactNode; style: object[] }) => {
    const combined = Object.assign({}, ...style);
    return createElement("div", { "data-safe-top": combined.paddingTop, "data-safe-left": combined.paddingLeft }, children);
  },
  ScrollView: ({ children }: { children: ReactNode }) => createElement("section", { "data-scroll": true }, children),
  View: ({ children, style }: { children: ReactNode; style?: object | object[] }) => {
    const combined = Object.assign({}, ...(Array.isArray(style) ? style : [style]));
    return createElement("div", { "data-max-height": combined.maxHeight }, children);
  },
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  Pressable: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => createElement("button", { onClick: onPress }, children),
}));
let root: Root;
let container: HTMLDivElement;
const close = vi.fn();
/** Renders the real sheet against the current simulated window. */
function render() {
  act(() => root.render(createElement(Sheet, { title: "Settle up", onClose: close,
    footer: createElement("button", { "data-submit": true }, "Save"), children: "Form content" })));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); close.mockClear();
  viewport.width = 1024; viewport.height = 600;
  Object.assign(insets, { top: 24, bottom: 20, left: 0, right: 0 });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("resizable sheet", () => {
  it("allows iPad landscape and constrains the card inside its padded window", () => {
    render();
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-orientations")).toContain("landscape-left,landscape-right");
    expect(Number(container.querySelector("[data-max-height]")?.getAttribute("data-max-height"))).toBeLessThanOrEqual(600 - 64);
    viewport.height = 420; render();
    expect(Number(container.querySelector("[data-max-height]")?.getAttribute("data-max-height"))).toBeLessThanOrEqual(420 - 64);
  });
  it("keeps the submit action outside scrolling content in a phone-sized window", () => {
    viewport.width = 390; viewport.height = 844; render();
    expect(container.querySelector("[data-scroll]")?.textContent).toBe("Form content");
    expect(container.querySelector("[data-submit]")?.closest("[data-scroll]")).toBeNull();
    expect(Number(container.querySelector("[data-max-height]")?.getAttribute("data-max-height"))).toBeCloseTo(844 * 0.92);
  });
  it("offers no way out without onClose, for a screen that must lead to the permission alert", () => {
    act(() => root.render(createElement(Sheet, { title: "Notifications", children: "Why",
      footer: createElement("span", { "data-continue": true }, "Continue") })));
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector("[data-continue]")?.textContent).toBe("Continue");
  });
  it("reserves the phone's notch and side insets when the available height is short", () => {
    viewport.width = 390; viewport.height = 420;
    Object.assign(insets, { top: 96, bottom: 34, left: 44, right: 44 });
    render();
    expect(container.querySelector("[data-safe-top]")?.getAttribute("data-safe-top")).toBe("96");
    expect(container.querySelector("[data-safe-left]")?.getAttribute("data-safe-left")).toBe("44");
    expect(Number(container.querySelector("[data-max-height]")?.getAttribute("data-max-height"))).toBeLessThanOrEqual(420 - 96);
  });
  it("preserves backdrop dismissal after resizing", () => {
    render(); viewport.width = 600; render();
    act(() => container.querySelector("button")!.click());
    expect(close).toHaveBeenCalledOnce();
  });
});

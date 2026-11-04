/** @vitest-environment jsdom */
/** Dialog bounds and actions must survive iPad rotation and narrow multitasking windows. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

const viewport = vi.hoisted(() => ({ width: 1024, height: 600, fontScale: 1 }));
const layout = vi.hoisted(() => ({ onLayout: undefined as ((event: { nativeEvent: { layout: { height: number } } }) => void) | undefined }));
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
    return createElement("div", { "data-safe-top": combined.paddingTop, "data-safe-left": combined.paddingLeft,
      "data-centered": combined.justifyContent === "center" }, children);
  },
  ScrollView: ({ children }: { children: ReactNode }) => createElement("section", { "data-scroll": true }, children),
  View: ({ children, style, onLayout }: { children: ReactNode; style?: object | object[]; onLayout?: typeof layout.onLayout }) => {
    if (onLayout) layout.onLayout = onLayout;
    const combined = Object.assign({}, ...(Array.isArray(style) ? style : [style]));
    return createElement("div", { "data-max-height": combined.maxHeight, "data-pointer-events": combined.pointerEvents }, children);
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
  viewport.width = 1024; viewport.height = 600; viewport.fontScale = 1; layout.onLayout = undefined;
  Object.assign(insets, { top: 24, bottom: 20, left: 0, right: 0 });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("resizable sheet", () => {
  it("allows iPad landscape and constrains the card inside its padded window", () => {
    render();
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-orientations")).toContain("landscape-left,landscape-right");
    expect(Number(container.querySelector("[data-max-height]")?.getAttribute("data-max-height"))).toBeLessThanOrEqual(600 - 64);
    viewport.height = 700; render();
    expect(Number(container.querySelector("[data-max-height]")?.getAttribute("data-max-height"))).toBeLessThanOrEqual(700 - 64);
  });
  it("centres the dialog only in a window that is tall as well as wide", () => {
    for (const [width, height, centered] of [
      [1024, 600, true], // iPad in landscape
      [669, 951, true], // iPhone Duo open, held upright
      [951, 669, true], // iPhone Duo open, held wide
      [667, 375, false], // iPhone SE held sideways: a centred card would vanish behind the keyboard
      [678, 466, false], // iPhone Duo folded, cover held sideways
      [390, 844, false], // phone held upright
    ] as const) {
      Object.assign(viewport, { width, height }); render();
      expect(container.querySelector("[data-centered]")?.getAttribute("data-centered")).toBe(String(centered));
    }
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
  it("keeps the form mounted and reachable when keyboard, text size and folding leave no room for pinned controls", () => {
    const input = createElement("input", { defaultValue: "Unsaved note" });
    const draw = () => act(() => root.render(createElement(Sheet, {
      title: "Record a payment received", onClose: close,
      footer: createElement("button", { "data-submit": true }, "Save"), children: input,
    })));
    draw();
    const field = container.querySelector("input")!;
    field.focus();
    expect(container.querySelector("[data-submit]")?.closest("[data-scroll]")).toBeNull();
    // Real available height, after the sideways cover's software keyboard.
    act(() => layout.onLayout?.({ nativeEvent: { layout: { height: 250 } } }));
    expect(container.querySelector("[data-scroll]")?.textContent).toContain("Record a payment received");
    expect(container.querySelector("[data-submit]")?.closest("[data-scroll]")).not.toBeNull();
    viewport.width = 669; viewport.fontScale = 2; draw();
    act(() => layout.onLayout?.({ nativeEvent: { layout: { height: 600 } } }));
    expect(container.querySelector("[data-submit]")?.closest("[data-scroll]")).not.toBeNull();
    viewport.fontScale = 1; draw();
    expect(container.querySelector("[data-submit]")?.closest("[data-scroll]")).toBeNull();
    expect(container.querySelector("input")).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("Unsaved note");
  });
  it("preserves backdrop dismissal after resizing", () => {
    render(); viewport.width = 600; render();
    act(() => container.querySelector("button")!.click());
    expect(close).toHaveBeenCalledOnce();
    // The measured space covers the backdrop: a tap outside the card must pass through it.
    expect(container.querySelector("[data-pointer-events]")?.getAttribute("data-pointer-events")).toBe("box-none");
  });
});

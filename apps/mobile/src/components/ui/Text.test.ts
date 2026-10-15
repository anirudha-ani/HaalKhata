/** @vitest-environment jsdom */
/** Dynamic Type refreshes native text measurements without resetting adjacent form state. */

import { act, createElement, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Text } from "./Text";

const viewport = vi.hoisted(() => ({ width: 390, height: 844, fontScale: 1, platform: "ios" }));
vi.mock("react-native", () => ({
  Platform: { get OS() { return viewport.platform; } },
  useWindowDimensions: () => viewport,
  Text: ({ children, accessibilityLabel, onPress, ref: nativeRef }: {
    children: ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
    ref?: React.Ref<HTMLSpanElement>;
  }) => createElement("span", { "aria-label": accessibilityLabel, onClick: onPress, ref: nativeRef }, children),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  viewport.fontScale = 1; viewport.width = 390; viewport.platform = "ios";
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("refreshes iOS text on scale changes while forwarding nested text, accessibility and presses", () => {
  const pressed = vi.fn();
  /** Renders identical content so only the scale change can refresh its native measurement. */
  const render = () => act(() => root.render(createElement(Text, {
    accessibilityLabel: "Amount owed", onPress: pressed,
  }, "You owe ", createElement(Text, null, "$42.00"))));
  render();
  const original = container.firstElementChild;
  viewport.width = 834; render();
  expect(container.firstElementChild).toBe(original);
  viewport.fontScale = 1.786; render();
  expect(container.firstElementChild).not.toBe(original);
  expect(container.textContent).toBe("You owe $42.00");
  expect(container.firstElementChild?.getAttribute("aria-label")).toBe("Amount owed");
  act(() => (container.firstElementChild as HTMLElement).click());
  expect(pressed).toHaveBeenCalledOnce();
});

it("keeps native text hosts stable on Android and when scaling is explicitly disabled", () => {
  for (const platform of ["android", "ios"]) {
    viewport.platform = platform; viewport.fontScale = 1;
    const allowFontScaling = platform === "android";
    act(() => root.render(createElement(Text, { allowFontScaling }, "AM")));
    const original = container.firstElementChild;
    viewport.fontScale = 1.786;
    act(() => root.render(createElement(Text, { allowFontScaling }, "AM")));
    expect(container.firstElementChild).toBe(original);
  }
});

it("updates the caller's ref to the current native host after remeasurement", () => {
  const reference = createRef<React.ComponentRef<typeof Text>>();
  act(() => root.render(createElement(Text, { ref: reference }, "Label")));
  expect(reference.current).toBe(container.firstElementChild);
  viewport.fontScale = 2;
  act(() => root.render(createElement(Text, { ref: reference }, "Label")));
  expect(reference.current).toBe(container.firstElementChild);
});

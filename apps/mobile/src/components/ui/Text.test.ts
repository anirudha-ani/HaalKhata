/** @vitest-environment jsdom */
/** Dynamic Type refreshes native text measurements without resetting adjacent form state. */

import { act, createElement, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FontScaleProvider } from "@/lib/layout/FontScaleProvider";
import { Text } from "./Text";

const viewport = vi.hoisted(() => ({ width: 390, height: 844, fontScale: 1, platform: "ios", reads: 0, textRenders: 0 }));
vi.mock("react-native", () => ({
  Platform: { get OS() { return viewport.platform; } },
  useWindowDimensions: () => { viewport.reads += 1; return viewport; },
  Text: ({ children, accessibilityLabel, onPress, ref: nativeRef }: {
    children: ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
    ref?: React.Ref<HTMLSpanElement>;
  }) => { viewport.textRenders += 1; return createElement("span", { "aria-label": accessibilityLabel, onClick: onPress, ref: nativeRef }, children); },
}));

let root: Root;
let container: HTMLDivElement;

/** @param content Text subtree. @returns Renders under the single font-scale provider. */
function renderText(content: ReactNode) {
  root.render(createElement(FontScaleProvider, null, content));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  viewport.fontScale = 1; viewport.width = 390; viewport.reads = 0; viewport.textRenders = 0; viewport.platform = "ios";
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("refreshes iOS text on scale changes while forwarding nested text, accessibility and presses", () => {
  const pressed = vi.fn();
  /** Renders identical content so only the scale change can refresh its native measurement. */
  const render = () => act(() => renderText(createElement(Text, {
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
    act(() => renderText(createElement(Text, { allowFontScaling }, "AM")));
    const original = container.firstElementChild;
    viewport.fontScale = 1.786;
    act(() => renderText(createElement(Text, { allowFontScaling }, "AM")));
    expect(container.firstElementChild).toBe(original);
  }
});

it("updates the caller's ref to the current native host after remeasurement", () => {
  const reference = createRef<React.ComponentRef<typeof Text>>();
  act(() => renderText(createElement(Text, { ref: reference }, "Label")));
  expect(reference.current).toBe(container.firstElementChild);
  viewport.fontScale = 2;
  act(() => renderText(createElement(Text, { ref: reference }, "Label")));
  expect(reference.current).toBe(container.firstElementChild);
});

it("shares one dimension subscription and does not rerender text on width-only changes", () => {
  const content = createElement("div", null, Array.from({ length: 100 }, (_value, index) => createElement(Text, { key: index }, "Balance")));
  act(() => renderText(content));
  expect(viewport.reads).toBe(1);
  expect(viewport.textRenders).toBe(100);
  viewport.width = 834;
  act(() => renderText(content));
  expect(viewport.reads).toBe(2);
  expect(viewport.textRenders).toBe(100);
  viewport.fontScale = 2;
  act(() => renderText(content));
  expect(viewport.textRenders).toBe(200);
});

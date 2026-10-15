/** @vitest-environment jsdom */
/** Responsive scaffolding must retain focused, controlled inputs through edits and resizing. */

import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TextField } from "@/components/ui/TextField";
import { Screen } from "./Screen";

const viewport = vi.hoisted(() => ({ width: 390, height: 844, fontScale: 1 }));
vi.mock("@/components/ui/ToastProvider", () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => viewport,
  Platform: { OS: "ios", select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  RefreshControl: () => null,
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  ScrollView: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  TextInput: ({ value, onChangeText, accessibilityLabel }: {
    value: string; onChangeText: (value: string) => void; accessibilityLabel: string;
  }) => createElement("input", { value, "aria-label": accessibilityLabel,
    onInput: (event: { currentTarget: HTMLInputElement }) => onChangeText(event.currentTarget.value) }),
}));

let container: HTMLDivElement;
let root: Root;

/** @returns A real screen and text field with a controlled draft, like the app's forms. */
function DraftForm() {
  const [draft, setDraft] = useState("");
  return createElement(Screen, { children: createElement(TextField, {
    label: "Email or phone", value: draft, onChangeText: setDraft,
  }) });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  viewport.width = 390; viewport.fontScale = 1;
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("retains the input instance, draft and focus after each character, rotation and larger text", () => {
  act(() => root.render(createElement(DraftForm)));
  const input = container.querySelector("input")!;
  let label = container.querySelector("span")!;
  let previousScale = viewport.fontScale;
  input.focus();
  for (const character of "layout@example.test") {
    act(() => {
      input.value += character;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);
  }
  for (const [width, fontScale] of [[1194, 1], [834, 1.8], [600, 1.8], [390, 1]]) {
    viewport.width = width; viewport.fontScale = fontScale;
    act(() => root.render(createElement(DraftForm)));
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("layout@example.test");
    expect(document.activeElement).toBe(input);
    const nextLabel = container.querySelector("span")!;
    if (fontScale !== previousScale) expect(nextLabel).not.toBe(label);
    else expect(nextLabel).toBe(label);
    expect(nextLabel.textContent).toBe("Email or phone");
    label = nextLabel;
    previousScale = fontScale;
  }
});

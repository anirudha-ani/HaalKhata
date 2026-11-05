/** @vitest-environment jsdom */
/** Welcome layouts must preserve an open sign-in and story position through a fold. */

import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen";

const layout = vi.hoisted(() => ({ isSpacious: false, isLargeText: false, fontScale: 1 }));
vi.mock("@/lib/layout/hooks/useResponsiveLayout", () => ({ useResponsiveLayout: () => layout }));
vi.mock("./hooks/useLeaveWhenSignedIn", () => ({ useLeaveWhenSignedIn: () => false }));
vi.mock("@/lib/motion/hooks/useReduceMotion", () => ({ useReduceMotion: () => true }));
vi.mock("@/lib/motion/entrances", () => ({ dropIn: () => undefined }));
vi.mock("react-native", () => ({
  Platform: { select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  Image: () => null,
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  ScrollView: ({ children }: { children: ReactNode }) => createElement("section", null, children),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
vi.mock("@/components/ui/Text", () => ({
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("@/components/ui/Spinner", () => ({ Spinner: () => null }));
vi.mock("./components/DevPasswordButton/DevPasswordButton", () => ({
  DevPasswordButton: () => {
    const [opened, setOpened] = useState(false);
    return createElement("div", null,
      createElement("button", { "data-password": true, onClick: () => setOpened(true) }, "Password"),
      opened ? createElement("input", { defaultValue: "", "aria-label": "Sign-in draft" }) : null);
  },
}));
vi.mock("./components/SignInPanel/SignInPanel", () => ({
  SignInPanel: ({ variant }: { variant: string }) => {
    const [pending, setPending] = useState(false);
    return createElement("button", { "data-provider": true, "data-variant": variant,
      onClick: () => setPending(true) }, pending ? "Waiting for provider" : "Sign in");
  },
}));
vi.mock("./components/WelcomeStory/WelcomeStory", () => ({
  WelcomeStory: () => {
    const [step, setStep] = useState(1);
    return createElement("button", { "data-story": true, onClick: () => setStep(step + 1) }, `Step ${step}`);
  },
}));

let container: HTMLDivElement;
let root: Root;

/** Renders the same screen against the current window and text size. */
function render() {
  act(() => root.render(createElement(LoginScreen)));
}

beforeEach(() => {
  Object.assign(layout, { isSpacious: false, isLargeText: false, fontScale: 1 });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("welcome screen resizing", () => {
  it("retains the draft, focused input, pending provider and story step through folds and Dynamic Type", () => {
    render();
    act(() => {
      container.querySelector<HTMLButtonElement>("[data-password]")!.click();
      container.querySelector<HTMLButtonElement>("[data-provider]")!.click();
      container.querySelector<HTMLButtonElement>("[data-story]")!.click();
    });
    const field = container.querySelector("input")!;
    field.value = "fold-review@example.test";
    field.focus();
    for (const [spacious, largeText, variant] of [
      [true, false, "card"], [true, true, "dock"], [false, true, "dock"], [false, false, "dock"],
    ] as const) {
      Object.assign(layout, { isSpacious: spacious, isLargeText: largeText, fontScale: largeText ? 2 : 1 });
      render();
      expect(container.querySelector("input")).toBe(field);
      expect(document.activeElement).toBe(field);
      expect(field.value).toBe("fold-review@example.test");
      expect(container.querySelector("[data-provider]")?.textContent).toBe("Waiting for provider");
      expect(container.querySelector("[data-provider]")?.getAttribute("data-variant")).toBe(variant);
      expect(container.querySelector("[data-story]")?.textContent).toBe("Step 2");
    }
  });
});

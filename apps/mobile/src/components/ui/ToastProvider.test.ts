/** @vitest-environment jsdom */
/** Errors from screen orchestrators and nested controls must reach the same pinned, dismissible alert. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Screen } from "@/components/shell/Screen/Screen";
import { useToast } from "./ToastProvider";

vi.mock("lucide-react-native", () => ({ CircleAlert: () => null, X: () => null }));
vi.mock("@/lib/motion/hooks/useReduceMotion", () => ({ useReduceMotion: () => true }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 1024, height: 768, fontScale: 1 }),
  Platform: { OS: "ios", select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  RefreshControl: () => null,
  View: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) =>
    createElement("div", { role: accessibilityRole }, children),
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  ScrollView: ({ children }: { children: ReactNode }) => createElement("section", { "data-scroll": true }, children),
  Pressable: ({ children, onPress, accessibilityLabel }: {
    children: ReactNode; onPress: () => void; accessibilityLabel: string;
  }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
}));

let root: Root;
let container: HTMLDivElement;

/** @returns A nested control whose failure uses the context API. */
function FailingControl() {
  const toast = useToast();
  return createElement("button", { onClick: () => toast.showError("Couldn't save the expense") }, "Save");
}

/** @param error Failure owned by a screen's hook, above Screen's provider. */
function render(error: string) {
  act(() => root.render(createElement(Screen, { error, children: createElement(FailingControl) })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("shows orchestrator failures outside the scrolling content and allows another attempt after dismissal", () => {
  render("");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  render("Couldn't accept the request");
  const alert = container.querySelector('[role="alert"]')!;
  expect(alert.textContent).toBe("Couldn't accept the request");
  expect(alert.closest("[data-scroll]")).toBeNull();
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  render(""); render("Couldn't accept the request");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Couldn't accept the request");
});

it("continues to show errors raised by controls inside Screen", () => {
  render("");
  act(() => container.querySelector<HTMLButtonElement>("[data-scroll] button")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Couldn't save the expense");
});

/** @vitest-environment jsdom */
/** Navigation must resize with the window and badge only actual pending friend requests. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { PrimaryNavigation } from "./PrimaryNavigation";

const state = vi.hoisted(() => ({ width: 390, pending: 0, push: vi.fn() }));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: state.width, height: 844 }),
  Platform: { select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@/lib/hooks/useShellData", () => ({ useShellData: () => ({ pendingFriendRequestCount: state.pending }) }));
vi.mock("./components/AddExpenseTabButton/AddExpenseTabButton", () => ({ AddExpenseTabButton: () => null }));
vi.mock("lucide-react-native", () => ({ Home: () => null, Plus: () => null, ReceiptText: () => null, Users: () => null, UsersRound: () => null }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: state.push }),
  Tabs: Object.assign(
    ({ children, screenOptions }: { children: ReactNode; screenOptions: { tabBarPosition: string } }) =>
      createElement("nav", { "data-position": screenOptions.tabBarPosition }, children),
    { Screen: ({ name, options, listeners }: {
      name: string;
      options: { title: string; tabBarBadge?: number };
      listeners?: { tabPress: (event: { preventDefault: () => void }) => void };
    }) => createElement("button", { "data-route": name, "data-badge": options.tabBarBadge,
      onClick: () => listeners?.tabPress({ preventDefault: () => {} }) }, options.title) },
  ),
}));

let root: Root;
let container: HTMLDivElement;

/** @returns The actual layout hook's expanded flag, alongside the actual navigator under test. */
function NavigationProbe() {
  const { isExpanded } = useResponsiveLayout();
  return createElement("div", { "data-expanded": isExpanded }, createElement(PrimaryNavigation));
}

/** Re-renders after the simulated window or notification query changes. */
function render() {
  act(() => root.render(createElement(NavigationProbe)));
}

beforeEach(() => {
  state.width = 390; state.pending = 0; state.push.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("phone and tablet navigation", () => {
  it("does not turn the Groups array index into a notification badge", () => {
    render();
    expect(container.querySelectorAll("[data-badge]")).toHaveLength(0);
    state.pending = 3; render();
    expect(container.querySelector('[data-route="friends"]')?.getAttribute("data-badge")).toBe("3");
    expect(container.querySelector('[data-route="groups"]')?.hasAttribute("data-badge")).toBe(false);
    state.pending = 0; render();
    expect(container.querySelectorAll("[data-badge]")).toHaveLength(0);
  });
  it("adapts through phone, iPad portrait, landscape and a narrow multitasking window without losing destinations", () => {
    for (const [width, position, expanded] of [
      [390, "bottom", false], [768, "left", false], [1024, "left", true], [600, "bottom", false],
    ] as const) {
      state.width = width; render();
      expect(container.querySelector("nav")?.getAttribute("data-position")).toBe(position);
      expect(container.querySelector("[data-expanded]")?.getAttribute("data-expanded")).toBe(String(expanded));
      expect(Array.from(container.querySelectorAll("button")).map((button) => button.textContent))
        .toEqual(["Home", "Groups", "Add", "Expenses", "Friends"]);
    }
  });
  it("opens the same expense form from the phone button and tablet rail", () => {
    for (const width of [390, 1024]) {
      state.width = width; render();
      act(() => (container.querySelector('[data-route="add"]') as HTMLButtonElement).click());
    }
    expect(state.push.mock.calls).toEqual([["/expenses/new"], ["/expenses/new"]]);
  });
});

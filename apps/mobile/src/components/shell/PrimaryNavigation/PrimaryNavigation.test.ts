/** @vitest-environment jsdom */
/** Navigation must resize with the window and badge only actual pending friend requests. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { PrimaryNavigation } from "./PrimaryNavigation";

const state = vi.hoisted(() => ({ width: 390, fontScale: 1, pending: 0, push: vi.fn(), insets: { top: 0, right: 0, bottom: 0, left: 0 } }));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: state.width, height: 844, fontScale: state.fontScale }),
  Platform: { select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => state.insets }));
vi.mock("@/lib/hooks/useShellData", () => ({ useShellData: () => ({ pendingFriendRequestCount: state.pending }) }));
vi.mock("./components/AddExpenseTabButton/AddExpenseTabButton", () => ({ AddExpenseTabButton: () => null }));
vi.mock("lucide-react-native", () => ({ Home: () => null, Plus: () => null, ReceiptText: () => null, Users: () => null, UsersRound: () => null }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: state.push }),
  Tabs: Object.assign(
    ({ children, screenOptions }: { children: ReactNode; screenOptions: { tabBarPosition: string; tabBarStyle: unknown } }) =>
      createElement("nav", {
        "data-position": screenOptions.tabBarPosition,
        // The bar's own style, flattened the way React Native flattens a style array.
        "data-style": JSON.stringify(Object.assign({}, ...[screenOptions.tabBarStyle].flat())),
      }, children),
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

/** @returns The actual layout hook's expanded and spacious flags, alongside the actual navigator under test. */
function NavigationProbe() {
  const { isExpanded, isSpacious } = useResponsiveLayout();
  return createElement("div", { "data-expanded": isExpanded, "data-spacious": isSpacious }, createElement(PrimaryNavigation));
}

/** Re-renders after the simulated window or notification query changes. */
function render() {
  act(() => root.render(createElement(NavigationProbe)));
}

beforeEach(() => {
  state.width = 390; state.fontScale = 1; state.pending = 0; state.push.mockClear();
  state.insets = { top: 0, right: 0, bottom: 0, left: 0 };
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
  it("keeps tablet navigation while stacking content for larger text", () => {
    state.width = 1194; render();
    expect(container.querySelector("[data-expanded]")?.getAttribute("data-expanded")).toBe("true");
    state.fontScale = 1.6; render();
    expect(container.querySelector("nav")?.getAttribute("data-position")).toBe("left");
    expect(container.querySelector("[data-expanded]")?.getAttribute("data-expanded")).toBe("false");
    state.fontScale = 1; render();
    expect(container.querySelector("[data-expanded]")?.getAttribute("data-expanded")).toBe("true");
  });
  it("adapts through phone, iPad portrait, landscape and a narrow multitasking window without losing destinations", () => {
    for (const [width, position, expanded] of [
      [390, "bottom", false], [768, "left", false], [1024, "left", true], [600, "bottom", false],
      [744, "left", false],
    ] as const) {
      state.width = width; render();
      expect(container.querySelector("nav")?.getAttribute("data-position")).toBe(position);
      expect(container.querySelector("[data-expanded]")?.getAttribute("data-expanded")).toBe(String(expanded));
      expect(Array.from(container.querySelectorAll("button")).map((button) => button.textContent))
        .toEqual(["Home", "Groups", "Add", "Expenses", "Friends"]);
    }
  });
  it("follows iPhone Duo through its poses: bottom tabs on the upright outer display, the rail on the inner one", () => {
    for (const [width, position, spacious] of [
      // Outer upright, inner upright, inner wide, folded again; then the outer
      // display held sideways, which gets the rail as any iPhone held sideways does.
      [466, "bottom", false], [669, "left", false], [951, "left", true], [466, "bottom", false],
      [678, "left", false],
    ] as const) {
      state.width = width; render();
      expect(container.querySelector("nav")?.getAttribute("data-position")).toBe(position);
      expect(container.querySelector("[data-spacious]")?.getAttribute("data-spacious")).toBe(String(spacious));
    }
  });
  it("pads each side of the bottom bar by its own inset and widens the rail by the left one", () => {
    // iPhone Duo's outer display: the status bar runs down the right edge.
    state.width = 466; state.insets = { top: 0, right: 84, bottom: 20, left: 0 }; render();
    expect(JSON.parse(container.querySelector("nav")?.getAttribute("data-style") ?? "{}"))
      .toMatchObject({ paddingLeft: 0, paddingRight: 84 });
    state.width = 1024; state.insets = { top: 24, right: 0, bottom: 20, left: 59 }; render();
    expect(JSON.parse(container.querySelector("nav")?.getAttribute("data-style") ?? "{}"))
      .toMatchObject({ width: 128 + 59 });
  });
  it("keeps phone density beside the rail until the content has tablet room", () => {
    for (const [width, spacious] of [[640, false], [744, false], [767, false], [768, true], [1024, true]] as const) {
      state.width = width; render();
      expect(container.querySelector("nav")?.getAttribute("data-position")).toBe("left");
      expect(container.querySelector("[data-spacious]")?.getAttribute("data-spacious")).toBe(String(spacious));
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

/** @vitest-environment jsdom */
/** Navigation must resize with the window and badge only actual pending friend requests. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NAVIGATION_RAIL_WIDTH } from "@/lib/layout/constants/layout";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { PrimaryNavigation } from "./PrimaryNavigation";

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const state = vi.hoisted(() => ({
  width: 390, height: 844, fontScale: 1, rightToLeft: false, pending: 0, push: vi.fn(),
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: state.width, height: state.height, fontScale: state.fontScale }),
  I18nManager: { get isRTL() { return state.rightToLeft; } },
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
    ({ children, safeAreaInsets, screenOptions }: {
      children: ReactNode;
      safeAreaInsets: unknown;
      screenOptions: { tabBarPosition: string; tabBarStyle: unknown };
    }) =>
      createElement("nav", {
        "data-position": screenOptions.tabBarPosition,
        // What the navigator pads the bar by: it pads by these insets and no others.
        "data-navigator-insets": JSON.stringify(safeAreaInsets),
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

/**
 * Reads one attribute of the rendered navigation.
 *
 * @param selector - The element to read.
 * @param attribute - The attribute's name.
 * @returns The attribute's value, or null.
 */
function read(selector: string, attribute: string) {
  return container.querySelector(selector)?.getAttribute(attribute) ?? null;
}

beforeEach(() => {
  Object.assign(state, { width: 390, height: 844, fontScale: 1, rightToLeft: false, pending: 0, insets: NO_INSETS });
  state.push.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

// One row per window: its size, side insets, then where navigation goes and
// how dense the content is. Density counts the room left for the content,
// after the rail and the insets, so the insets matter as much as the size.
const WINDOWS = [
  // window,                            width, height, left, right, position, spacious, expanded
  ["phone held upright",                  390,   844,   0,    0,   "bottom",   false,   false],
  ["phone held sideways",                 844,   390,  47,   47,   "bottom",   true,    false],
  ["iPhone SE held sideways",             667,   375,   0,    0,   "bottom",   true,    false],
  ["narrow multitasking window",          600,  1024,   0,    0,   "bottom",   false,   false],
  ["iPad mini in portrait",               744,  1133,   0,    0,   "left",     false,   false],
  ["just short of room beside the rail",  767,  1024,   0,    0,   "left",     false,   false],
  ["iPad in portrait",                    768,  1024,   0,    0,   "left",     true,    false],
  ["iPad in landscape",                  1024,   768,   0,    0,   "left",     true,    true],
  ["iPhone Duo folded, cover upright",    466,   678,   0,   84,   "bottom",   false,   false],
  ["iPhone Duo folded, cover sideways",   678,   466,   0,   84,   "bottom",   false,   false],
  ["iPhone Duo open, held upright",       669,   951,   0,    0,   "left",     false,   false],
  ["iPhone Duo open, held wide",          951,   669,   0,   84,   "left",     true,    false],
] as const;

describe("phone and tablet navigation", () => {
  it("does not turn the Groups array index into a notification badge", () => {
    render();
    expect(container.querySelectorAll("[data-badge]")).toHaveLength(0);
    state.pending = 3; render();
    expect(read('[data-route="friends"]', "data-badge")).toBe("3");
    expect(container.querySelector('[data-route="groups"]')?.hasAttribute("data-badge")).toBe(false);
    state.pending = 0; render();
    expect(container.querySelectorAll("[data-badge]")).toHaveLength(0);
  });
  it("keeps the rail while stacking content for larger text", () => {
    state.width = 1194; render();
    expect(read("[data-expanded]", "data-expanded")).toBe("true");
    state.fontScale = 1.6; render();
    expect(read("nav", "data-position")).toBe("left");
    expect(read("[data-expanded]", "data-expanded")).toBe("false");
    state.fontScale = 1; render();
    expect(read("[data-expanded]", "data-expanded")).toBe("true");
  });
  it.each(WINDOWS)("lays out a %s without losing a destination", (_window, width, height, left, right, position, spacious, expanded) => {
    Object.assign(state, { width, height, insets: { ...NO_INSETS, left, right } });
    render();
    expect(read("nav", "data-position")).toBe(position);
    expect(read("[data-spacious]", "data-spacious")).toBe(String(spacious));
    expect(read("[data-expanded]", "data-expanded")).toBe(String(expanded));
    expect(Array.from(container.querySelectorAll("button")).map((button) => button.textContent))
      .toEqual(["Home", "Groups", "Add", "Expenses", "Friends"]);
  });
  it("hands the navigator no side inset for the bottom bar, which pads each side by its own", () => {
    // iPhone Duo's cover: the status bar runs down the right edge.
    Object.assign(state, { width: 466, height: 678, insets: { top: 0, right: 84, bottom: 20, left: 0 } });
    render();
    expect(JSON.parse(read("nav", "data-navigator-insets") ?? "null")).toEqual({ left: 0, right: 0 });
    expect(JSON.parse(read("nav", "data-style") ?? "{}")).toMatchObject({ paddingStart: 0, paddingEnd: 84 });
  });
  it("widens the rail by the inset on its own side, which is the right one right to left", () => {
    // iPhone Duo open and held wide: the status bar runs down the right edge.
    Object.assign(state, { width: 951, height: 669, insets: { top: 0, right: 84, bottom: 20, left: 0 } });
    render();
    expect(JSON.parse(read("nav", "data-style") ?? "{}")).toMatchObject({ width: NAVIGATION_RAIL_WIDTH });
    state.rightToLeft = true; render();
    expect(JSON.parse(read("nav", "data-navigator-insets") ?? "null")).toEqual({ left: 84, right: 84 });
    expect(JSON.parse(read("nav", "data-style") ?? "{}")).toMatchObject({ width: NAVIGATION_RAIL_WIDTH + 84 });
  });
  it("opens the same expense form from the phone button and the rail", () => {
    for (const [width, height] of [[390, 844], [1024, 768]]) {
      Object.assign(state, { width, height }); render();
      act(() => (container.querySelector('[data-route="add"]') as HTMLButtonElement).click());
    }
    expect(state.push.mock.calls).toEqual([["/expenses/new"], ["/expenses/new"]]);
  });
});

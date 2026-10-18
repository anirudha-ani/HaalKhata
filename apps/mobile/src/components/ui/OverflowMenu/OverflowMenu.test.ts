/** @vitest-environment jsdom */
/** A menu action must reach the sheet it opens on iOS, run exactly once, and hang the menu under its button. */

import { act, createElement, useImperativeHandle, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverflowMenu } from "./OverflowMenu";

const native = vi.hoisted(() => ({
  os: "ios",
  dismiss: undefined as (() => void) | undefined,
  // Where the button sits on screen: x, y, width, height.
  button: [334, 60, 44, 44] as const,
  windowWidth: 390,
}));
vi.mock("lucide-react-native", () => ({ EllipsisVertical: () => null }));
vi.mock("@/components/ui/Text", () => ({
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => undefined }) },
  Platform: {
    get OS() {
      return native.os;
    },
    select: (options: { default: string }) => options.default,
  },
  StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: native.windowWidth, height: 844, fontScale: 1 }),
  Modal: ({ children, visible, onDismiss }: { children: ReactNode; visible: boolean; onDismiss: () => void }) => {
    native.dismiss = onDismiss;
    return visible ? createElement("div", { role: "dialog" }, children) : null;
  },
  View: ({ children, style, accessibilityRole }: { children: ReactNode; style?: object | object[]; accessibilityRole?: string }) => {
    const combined = Object.assign({}, ...(Array.isArray(style) ? style : [style]));
    return createElement("div", { role: accessibilityRole, "data-top": combined.top, "data-right": combined.right }, children);
  },
  Pressable: ({
    children,
    onPress,
    disabled,
    accessibilityLabel,
    accessibilityRole,
    ref,
  }: {
    children: ReactNode;
    onPress: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    ref?: Ref<{ measureInWindow: (callback: (...frame: number[]) => void) => void }>;
  }) => {
    useImperativeHandle(ref, () => ({ measureInWindow: (callback) => callback(...native.button) }));
    return createElement("button", { onClick: onPress, disabled, "aria-label": accessibilityLabel, role: accessibilityRole }, children);
  },
}));

let root: Root;
let container: HTMLDivElement;
const archive = vi.fn();
const report = vi.fn();

/** Renders the menu with one enabled and, optionally, one disabled action. */
function render(reportDisabled = false) {
  act(() =>
    root.render(
      createElement(OverflowMenu, {
        label: "Group options",
        items: [
          { label: "Archive group", icon: null, onSelect: archive },
          { label: "Report group", icon: null, onSelect: report, disabled: reportDisabled },
        ],
      }),
    ),
  );
}

/** Opens the menu from its button. */
function open() {
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Group options"]')!.click());
}

/**
 * Presses one of the open menu's actions.
 *
 * @param label - The action's words.
 */
function choose(label: string) {
  const item = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(
    (button) => button.textContent === label,
  );
  act(() => item!.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  archive.mockClear();
  report.mockClear();
  native.os = "ios";
  native.dismiss = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("overflow menu", () => {
  it("hangs the menu under its button, aligned to the button's right edge", () => {
    render();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    open();
    const card = container.querySelector('[role="menu"]')!.parentElement!;
    expect(Number(card.getAttribute("data-top"))).toBeGreaterThan(60 + 44);
    expect(Number(card.getAttribute("data-right"))).toBe(390 - 334 - 44);
  });

  it("on iOS, waits for the menu to finish leaving before running the action", () => {
    render();
    open();
    choose("Report group");
    // Gone from the screen, but a sheet presented now would never appear.
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(report).not.toHaveBeenCalled();
    act(() => native.dismiss?.());
    expect(report).toHaveBeenCalledOnce();
    // A later dismissal of the same modal does not run it a second time.
    act(() => native.dismiss?.());
    expect(report).toHaveBeenCalledOnce();
  });

  it("on Android, runs the action straight away and only once", () => {
    native.os = "android";
    render();
    open();
    choose("Archive group");
    expect(archive).toHaveBeenCalledOnce();
    act(() => native.dismiss?.());
    expect(archive).toHaveBeenCalledOnce();
  });

  it("closing without choosing runs nothing", () => {
    render();
    open();
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Close menu"]')!.click());
    act(() => native.dismiss?.());
    expect(archive).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("ignores a disabled action", () => {
    render(true);
    open();
    choose("Report group");
    act(() => native.dismiss?.());
    expect(report).not.toHaveBeenCalled();
  });
});

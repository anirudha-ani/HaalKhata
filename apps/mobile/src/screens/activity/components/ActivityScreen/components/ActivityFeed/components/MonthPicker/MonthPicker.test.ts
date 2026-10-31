/** @vitest-environment jsdom */
/** The month control: it names what is chosen, and choosing happens in its sheet. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthPicker } from "./MonthPicker";

vi.mock("lucide-react-native", () => ({ Check: () => createElement("i", { "data-check": true }), ChevronDown: () => null }));
vi.mock("@/components/ui/Text", () => ({
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("@/components/ui/Sheet/Sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => createElement("div", { role: "dialog" }, children),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios", select: (options: { default: unknown }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Pressable: ({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress: () => void; accessibilityLabel?: string }) =>
    createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
}));

const MONTHS = ["2026-10", "2026-09"];
let root: Root;
let container: HTMLDivElement;
const onChange = vi.fn();

/**
 * Shows the control.
 *
 * @param month - The chosen month.
 */
function render(month: string) {
  act(() => root.render(createElement(MonthPicker, { month, months: MONTHS, onChange })));
}

/**
 * Presses a button by its text.
 *
 * @param label - The text.
 */
function press(label: string) {
  const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`no button says ${label}`);
  act(() => button.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onChange.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("MonthPicker", () => {
  it("is one button until it is opened", () => {
    render("");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.textContent).toBe("All time");
  });

  it("names the chosen month", () => {
    render("2026-09");
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Month: September 2026");
  });

  it("lists every month, ticks the chosen one, and closes on a choice", () => {
    render("2026-10");
    press("October 2026");
    const sheet = container.querySelector('[role="dialog"]');
    expect(sheet?.textContent).toBe("All timeOctober 2026September 2026");
    expect(sheet?.querySelectorAll("[data-check]")).toHaveLength(1);

    act(() => [...(sheet?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "September 2026")?.click());

    expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-09");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("goes back to the whole history", () => {
    render("2026-10");
    press("October 2026");
    press("All time");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("");
  });
});

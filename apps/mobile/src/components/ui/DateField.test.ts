/** @vitest-environment jsdom */
/** Calendar edits are confirmed explicitly on iOS and retain Android's native dismiss behavior. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DateField } from "./DateField";

const platform = vi.hoisted(() => ({ OS: "ios", select: (options: { default: string }) => options.default }));
vi.mock("react-native", () => ({
  Platform: platform,
  Keyboard: { dismiss: () => undefined },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  Pressable: ({ children, accessibilityLabel, onPress }: {
    children: ReactNode; accessibilityLabel: string; onPress: () => void;
  }) => createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }, children),
}));
vi.mock("lucide-react-native", () => ({ CalendarDays: () => null }));
vi.mock("@/lib/motion/hooks/useReduceMotion", () => ({ useReduceMotion: () => false }));
vi.mock("@/components/ui/Button", () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) =>
    createElement("button", { onClick: onPress }, label),
}));
vi.mock("@/components/ui/Sheet/Sheet", () => ({
  Sheet: ({ children, footer, onClose }: { children: ReactNode; footer: ReactNode; onClose: () => void }) =>
    createElement("div", { role: "dialog" },
      createElement("button", { onClick: onClose }, "Close"), children, footer),
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: ({ onChange, value }: {
    value: Date; onChange: (event: { type: string }, selected?: Date) => void;
  }) => createElement("div", { "data-picker-day": value.getDate() },
    createElement("button", { onClick: () => onChange({ type: "set" }, new Date(2026, 9, 26, 12)) }, "Choose date"),
    createElement("button", { onClick: () => onChange({ type: "dismissed" }) }, "Dismiss picker")),
}));

let root: Root;
let container: HTMLDivElement;
const changed = vi.fn();

/** @param value Current parent-owned date to render. */
function render(value = "2026-10-25") {
  act(() => root.render(createElement(DateField, { value, label: "Expense date", onChange: changed })));
}

/** @param label The exact visible button label to press. */
function press(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === label);
  expect(button).toBeDefined();
  act(() => button!.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  platform.OS = "ios";
  changed.mockClear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("opens the iOS picker in one tap and commits the draft only on Done", () => {
  render(); press("2026-10-25");
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  press("Choose date");
  expect(changed).not.toHaveBeenCalled();
  expect(container.querySelector("[data-picker-day]")?.getAttribute("data-picker-day")).toBe("26");
  press("Done");
  expect(changed).toHaveBeenCalledExactlyOnceWith("2026-10-26");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("discards a cancelled draft and reopens on the current date from the parent", () => {
  render(); press("2026-10-25"); press("Choose date"); press("Close");
  expect(changed).not.toHaveBeenCalled();
  render("2026-11-04"); press("2026-11-04");
  expect(container.querySelector("[data-picker-day]")?.getAttribute("data-picker-day")).toBe("4");
});

it("preserves Android selection and cancellation without adding another dialog", () => {
  platform.OS = "android";
  render(); press("2026-10-25");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  press("Dismiss picker");
  expect(changed).not.toHaveBeenCalled();
  expect(container.querySelector("[data-picker-day]")).toBeNull();
  press("2026-10-25"); press("Choose date");
  expect(changed).toHaveBeenCalledExactlyOnceWith("2026-10-26");
  expect(container.querySelector("[data-picker-day]")).toBeNull();
});

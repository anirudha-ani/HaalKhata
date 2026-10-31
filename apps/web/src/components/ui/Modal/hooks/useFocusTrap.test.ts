// @vitest-environment jsdom
/** Tests for keeping the keyboard inside an open dialog. */

import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

let host: HTMLDivElement;
let opener: HTMLButtonElement;
let root: Root;

/**
 * A dialog using the trap, as Modal does.
 *
 * @param props - What to put inside it.
 * @returns The dialog.
 */
function Dialog({ label, children }: { label: string; children?: ReactNode }) {
  const [element] = useState<{ current: HTMLDivElement | null }>({ current: null });
  useFocusTrap(element);
  return createElement("div", { ref: element, tabIndex: -1, "aria-label": label }, children);
}

/** Three controls, the middle one disabled, so the ends are what Tab wraps between. */
const THREE_CONTROLS = [
  createElement("button", { key: "first" }, "first"),
  createElement("button", { key: "disabled", disabled: true }, "disabled"),
  createElement("input", { key: "last", "aria-label": "last" }),
];

/**
 * Presses Tab where focus is now.
 *
 * @param shiftKey - Whether Shift is held.
 * @returns Whether the trap took the press.
 */
function pressTab(shiftKey = false): boolean {
  const press = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  document.activeElement?.dispatchEvent(press);
  return press.defaultPrevented;
}

/**
 * Opens a dialog from the opener button.
 *
 * @param content - The dialog to mount.
 */
function open(content: ReactNode): void {
  opener.focus();
  act(() => root.render(content));
}

/**
 * Finds a control by its text or label.
 *
 * @param label - The text.
 * @returns The element.
 */
function control(label: string): HTMLElement {
  const found = Array.from(host.querySelectorAll<HTMLElement>("button, input")).find(
    (element) => element.textContent === label || element.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`no control named ${label}`);
  return found;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  opener = document.createElement("button");
  host = document.createElement("div");
  document.body.append(opener, host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("useFocusTrap", () => {
  it("moves focus into the dialog when it opens", () => {
    open(createElement(Dialog, { label: "dialog" }, THREE_CONTROLS));
    expect(document.activeElement).toBe(host.firstElementChild);
  });

  it("leaves focus on a field that took it", () => {
    open(createElement(Dialog, { label: "dialog" }, createElement("input", { "aria-label": "name", autoFocus: true })));
    expect(document.activeElement).toBe(control("name"));
  });

  it("goes round from the last control to the first, past a disabled one", () => {
    open(createElement(Dialog, { label: "dialog" }, THREE_CONTROLS));
    control("last").focus();
    expect(pressTab()).toBe(true);
    expect(document.activeElement).toBe(control("first"));
  });

  it("goes round backwards from the first control and from the dialog itself", () => {
    open(createElement(Dialog, { label: "dialog" }, THREE_CONTROLS));
    expect(pressTab(true)).toBe(true);
    expect(document.activeElement).toBe(control("last"));
    control("first").focus();
    expect(pressTab(true)).toBe(true);
    expect(document.activeElement).toBe(control("last"));
  });

  it("leaves Tab to the browser between the ends", () => {
    open(createElement(Dialog, { label: "dialog" }, THREE_CONTROLS));
    control("first").focus();
    expect(pressTab()).toBe(false);
  });

  it("keeps focus where it is in a dialog with no controls", () => {
    open(createElement(Dialog, { label: "dialog" }, "Nothing to press"));
    expect(pressTab()).toBe(true);
    expect(document.activeElement).toBe(host.firstElementChild);
  });

  it("gives focus back to what opened it", () => {
    open(createElement(Dialog, { label: "dialog" }, THREE_CONTROLS));
    act(() => root.render(null));
    expect(document.activeElement).toBe(opener);
  });

  it("still gives focus back when a field inside took it first", () => {
    open(createElement(Dialog, { label: "dialog" }, createElement("input", { autoFocus: true })));
    act(() => root.render(null));
    expect(document.activeElement).toBe(opener);
  });

  it("lets a dialog inside a dialog answer Tab", () => {
    open(
      createElement(
        Dialog,
        { label: "outer" },
        createElement("button", { key: "behind" }, "behind"),
        createElement(Dialog, { key: "inner", label: "inner" }, createElement("button", null, "only")),
      ),
    );
    control("only").focus();
    expect(pressTab()).toBe(true);
    expect(document.activeElement).toBe(control("only"));
  });
});

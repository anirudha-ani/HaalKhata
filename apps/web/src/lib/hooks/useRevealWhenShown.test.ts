/** @vitest-environment jsdom */
/** A control is scrolled back into view when a message appears above it, and never as a page opens. */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRevealWhenShown } from "./useRevealWhenShown";

let root: Root;
let container: HTMLDivElement;
const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  scrollIntoView.mockClear();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/**
 * A button that uses the hook, like Show more under a paged list.
 *
 * @param props - Whether the message above it is showing.
 * @returns The button.
 */
function ShowMore({ shown }: { shown: boolean }) {
  const buttonRef = useRevealWhenShown<HTMLButtonElement>(shown);
  return createElement("button", { ref: buttonRef }, "Show more");
}

/**
 * Renders the button with the message shown or not.
 *
 * @param shown - Whether the message is showing.
 */
function render(shown: boolean) {
  act(() => root.render(createElement(ShowMore, { shown })));
}

it("scrolls the control into view each time the message appears", () => {
  render(false);
  expect(scrollIntoView).not.toHaveBeenCalled();
  render(true);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  render(true);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  render(false);
  render(true);
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});

it("does not scroll for a message that is already there when the page opens", () => {
  render(true);
  expect(scrollIntoView).not.toHaveBeenCalled();
});

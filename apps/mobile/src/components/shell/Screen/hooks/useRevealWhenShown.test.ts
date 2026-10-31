/** @vitest-environment jsdom */
/** A footer asks its screen to scroll it into sight when a message appears in it, and never as the screen opens. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScreenRevealContext, useRevealWhenShown } from "./useRevealWhenShown";

vi.mock("react-native", () => ({}));

let root: Root;
let container: HTMLDivElement;
const reveal = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  reveal.mockClear();
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
 * A footer that uses the hook; a DOM element stands in for the native view.
 *
 * @param props - Whether the message inside it is showing.
 * @returns The footer.
 */
function Footer({ shown }: { shown: boolean }) {
  const footerRef = useRevealWhenShown(shown);
  return createElement("div", { ref: footerRef as never }, "Show me more");
}

/**
 * Renders the footer inside a screen that records what it was asked to reveal.
 *
 * @param shown - Whether the message is showing.
 */
function render(shown: boolean) {
  const footer: ReactNode = createElement(Footer, { shown });
  act(() => root.render(createElement(ScreenRevealContext, { value: reveal }, footer)));
}

it("asks the screen to reveal the footer each time the message appears", () => {
  render(false);
  expect(reveal).not.toHaveBeenCalled();
  render(true);
  expect(reveal).toHaveBeenCalledTimes(1);
  expect(reveal).toHaveBeenCalledWith(container.firstElementChild);
  render(true);
  expect(reveal).toHaveBeenCalledTimes(1);
  render(false);
  render(true);
  expect(reveal).toHaveBeenCalledTimes(2);
});

it("does not scroll for a message that is already there when the screen opens", () => {
  render(true);
  expect(reveal).not.toHaveBeenCalled();
});

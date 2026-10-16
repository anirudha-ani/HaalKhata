/** @vitest-environment jsdom */
/** Avatar lifecycle tests with native host views represented by DOM nodes. */

import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar } from "./Avatar";

// Keep React reconciliation real; only replace the native host renderer.
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  Platform: { select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  Image: ({ source, onError }: { source: { uri: string }; onError: () => void }) =>
    createElement("img", { src: source.uri, onError }),
}));

type AvatarUser = ComponentProps<typeof Avatar>["user"];

const ALICE: AvatarUser = {
  id: "alice",
  name: "Alice Adams",
  avatarColor: "#123456",
  avatarUrl: "https://example.com/alice.png",
};
const BOBBY: AvatarUser = {
  id: "bobby",
  name: "Bob Brown",
  avatarColor: "#654321",
  avatarUrl: "https://example.com/bob.png",
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
 * Updates one avatar without remounting its outer component.
 *
 * @param user - Person whose picture should be displayed.
 */
function renderAvatar(user: AvatarUser) {
  act(() => root.render(createElement(Avatar, { user })));
}

/**
 * Reads the mocked native image host node.
 *
 * @returns The rendered image, failing if only initials are displayed.
 */
function picture(): HTMLImageElement {
  const image = container.querySelector("img");
  expect(image).not.toBeNull();
  return image!;
}

describe("Avatar", () => {
  it("replaces the native image when its person or photo changes", () => {
    renderAvatar(ALICE);
    const alicePicture = picture();
    renderAvatar(BOBBY);
    const bobPicture = picture();
    expect(bobPicture).not.toBe(alicePicture);

    renderAvatar({ ...BOBBY, avatarUrl: "https://example.com/bob-new.png" });

    expect(picture()).not.toBe(bobPicture);
    expect(picture().getAttribute("src")).toBe("https://example.com/bob-new.png");
  });

  it("retries a new photo after an image failure", () => {
    renderAvatar(ALICE);
    act(() => picture().dispatchEvent(new Event("error")));
    expect(container.textContent).toBe("AA");
    renderAvatar({ ...ALICE });
    expect(container.querySelector("img")).toBeNull();

    renderAvatar({ ...ALICE, avatarUrl: "https://example.com/alice-new.png" });

    expect(picture().getAttribute("src")).toBe("https://example.com/alice-new.png");
  });

  it("isolates image failures by person even when the URL is the same", () => {
    renderAvatar(ALICE);
    act(() => picture().dispatchEvent(new Event("error")));

    renderAvatar({ ...BOBBY, avatarUrl: ALICE.avatarUrl });

    expect(picture().getAttribute("src")).toBe(ALICE.avatarUrl);
    act(() => picture().dispatchEvent(new Event("error")));
    expect(container.textContent).toBe("BB");
  });

  it("ignores a delayed error from an old image", () => {
    renderAvatar(ALICE);
    const previousPicture = picture();
    renderAvatar(BOBBY);

    act(() => previousPicture.dispatchEvent(new Event("error")));

    expect(picture().getAttribute("src")).toBe(BOBBY.avatarUrl);
  });
});
